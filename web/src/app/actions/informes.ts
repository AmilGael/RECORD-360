"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assembleReportData, type ReportScope } from "@/lib/report/data";
import { buildInformeSystem, buildInformeUserMessage } from "@/lib/informes/prompt";
import { generateInformeContent, INFORME_MODEL } from "@/lib/informes/client";
import { requireFreshSession } from "@/lib/auth/session";
import type { InformeArchetype } from "@prisma/client";
import { ARCHETYPE_VALUES } from "@/lib/informes/archetypes";
import Anthropic from "@anthropic-ai/sdk";

export type InformeResult =
  | { ok: true; informeId: string }
  | { ok: false; error: string; missingFirma?: boolean };

/**
 * Generate and persist an AI informe. Any project member may request one (the
 * informe records who); the requester must have a firma on file because it is
 * stamped into the PDF footer.
 *
 * NOTE (deploy): generation is a synchronous Claude call (~10-30s at
 * max_tokens 4096). Fine in dev and within Netlify Pro's 26s window; if
 * production timeouts appear, move to a background function.
 */
export async function createInforme(_prev: InformeResult | null, formData: FormData): Promise<InformeResult> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "El generador de informes no esta configurado (falta la clave de API)." };

    const user = await requireFreshSession();

    const requester = await prisma.user.findFirst({
      where: { id: user.id, companyId: user.companyId },
      select: { id: true, name: true, signatureKey: true },
    });
    if (!requester) return { ok: false, error: "No autorizado." };
    if (!requester.signatureKey) {
      return { ok: false, missingFirma: true, error: "Necesitas registrar tu firma en Equipo antes de generar informes." };
    }

    const brief = String(formData.get("brief") ?? "").trim();
    if (!brief) return { ok: false, error: "Describe de que va el informe." };
    if (brief.length > 2000) return { ok: false, error: "La solicitud es demasiado larga (max. 2000 caracteres)." };

    // WS7: audience archetype is required (no default/preselect) — it drives
    // both the AI prompt's section structure and the PDF's audience label.
    const archetypeRaw = String(formData.get("archetype") ?? "");
    if (!ARCHETYPE_VALUES.includes(archetypeRaw as InformeArchetype)) {
      return { ok: false, error: "Selecciona la audiencia del informe." };
    }
    const archetype = archetypeRaw as InformeArchetype;

    const scopeRef = String(formData.get("scopeRef") ?? "");
    const [scopeType, scopeId] = scopeRef ? scopeRef.split(":", 2) : [String(formData.get("scopeType")), String(formData.get("scopeId"))];
    if (!["project", "segment", "partida"].includes(scopeType) || !scopeId) {
      return { ok: false, error: "Alcance invalido." };
    }
    const scope = { type: scopeType, id: scopeId } as ReportScope;

    const parseDate = (k: string): Date | null | "invalid" => {
      const raw = String(formData.get(k) ?? "").trim();
      if (!raw) return null;
      if (k === "to" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return new Date(`${raw}T23:59:59.999Z`);
      }
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? "invalid" : d;
    };
    const from = parseDate("from");
    const to = parseDate("to");
    if (from === "invalid" || to === "invalid") return { ok: false, error: "Rango de fechas invalido." };

    // Tenant + archived scoping happens inside assembleReportData.
    const data = await assembleReportData({ id: user.id, companyId: user.companyId, role: user.role }, scope, from, to);
    if (!data) return { ok: false, error: "No autorizado." };

    const contentMd = await generateInformeContent(buildInformeSystem(archetype), buildInformeUserMessage(data, brief));

    const informe = await prisma.informe.create({
      data: {
        projectId: data.project.id,
        segmentId: scope.type === "segment" ? scope.id : null,
        partidaId: scope.type === "partida" ? scope.id : null,
        requestedById: requester.id,
        archetype,
        brief,
        periodFrom: from,
        periodTo: to,
        contentMd,
        model: INFORME_MODEL,
      },
    });

    revalidatePath(`/app/projects/${data.project.id}`);
    return { ok: true, informeId: informe.id };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "El generador de informes no esta configurado (clave de API invalida)." };
    }
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionTimeoutError || (e instanceof Anthropic.APIError && Number(e.status) >= 529)) {
      return { ok: false, error: "El servicio esta ocupado. Intentalo de nuevo en un momento." };
    }
    return { ok: false, error: "No se pudo generar el informe. Intentalo de nuevo." };
  }
}
