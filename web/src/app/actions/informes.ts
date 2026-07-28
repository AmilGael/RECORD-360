"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assembleReportData, type ReportScope } from "@/lib/report/data";
import { buildInformeSystem, buildInformeUserMessage } from "@/lib/informes/prompt";
import { generateInformeContent, INFORME_MODEL, isCreditExhaustedError } from "@/lib/informes/client";
import { requireFreshSession } from "@/lib/auth/session";
import type { InformeArchetype } from "@prisma/client";
import { ARCHETYPE_VALUES } from "@/lib/informes/archetypes";
import { loadCompanySealPng } from "@/lib/report/seal";
import Anthropic from "@anthropic-ai/sdk";

export type InformeResult =
  | { ok: true; informeId: string }
  | { ok: false; error: string; missingFirma?: boolean; missingSeal?: boolean };

/**
 * Generate and persist an AI informe. Any project member may request one (the
 * informe records who); the requester must have a firma on file because it is
 * stamped into the PDF footer.
 *
 * NOTE (deploy): generation remains synchronous. Live calls measured 15-32s;
 * Netlify's current buffered synchronous-function ceiling is 60s. The
 * Anthropic client has its own 50s timeout and one-retry ceiling so a provider
 * stall fails cleanly before the platform terminates the request.
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
    // Match the PDF route's real requirement: a key alone is insufficient if
    // the object was removed or storage is unavailable.
    if (!(await loadCompanySealPng(user.companyId))) {
      return {
        ok: false,
        missingSeal: true,
        error: "Necesitas registrar el sello de la empresa en Equipo antes de generar informes.",
      };
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
    // Exhausted credits arrive as a 400 invalid_request_error, which would
    // otherwise fall through to the generic "try again" message — advice that
    // can never succeed until someone tops up the account. Treat it as the
    // configuration problem it is so the operator knows where to look.
    if (isCreditExhaustedError(e)) {
      return { ok: false, error: "El generador de informes no esta disponible: la cuenta de API no tiene saldo. Contacta al administrador." };
    }
    return { ok: false, error: "No se pudo generar el informe. Intentalo de nuevo." };
  }
}
