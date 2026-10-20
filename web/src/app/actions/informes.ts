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
import { parseRangeValue } from "@/lib/report/params";
import { buildInformeIdempotencyKey } from "@/lib/informes/idempotency";
import { notifyEvent } from "@/lib/notifications/events";
import { Prisma } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

export type InformeResult =
  | { ok: true; informeId: string; status: "READY" | "PENDING" }
  | { ok: false; error: string; missingFirma?: boolean; missingSeal?: boolean };

// A PENDING row older than this is presumed orphaned (its invocation died
// without flipping it): generation is bounded at 50s + one retry, so nothing
// legitimate is still running at 3 minutes. The next identical submission
// reclaims and retries it.
// NOT exported: a "use server" module may only export async functions. Exporting
// this number made Next.js reject the whole module at load time with
// `A "use server" file can only export async functions, found number`, which
// surfaces in production as a bare "Application error: a server-side exception
// has occurred" and took down the entire informes flow — no report could ever
// be generated. Nothing outside this file uses it; keep it module-private.
const PENDING_STALE_MS = 3 * 60_000;

function mapGenerationError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "El generador de informes no esta configurado (clave de API invalida).";
  }
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionTimeoutError || (e instanceof Anthropic.APIError && Number(e.status) >= 529)) {
    return "El servicio esta ocupado. Intentalo de nuevo en un momento.";
  }
  if (isCreditExhaustedError(e)) {
    return "El generador de informes no esta disponible: la cuenta de API no tiene saldo. Contacta al administrador.";
  }
  return "No se pudo generar el informe. Intentalo de nuevo.";
}

/**
 * Generate and persist an AI informe. Any project member may request one (the
 * informe records who); the requester must have a firma on file because it is
 * stamped into the PDF footer.
 *
 * Lifecycle: the Informe row is created PENDING before the AI call and flipped
 * to READY/FAILED afterwards, with a notification to the requester either way.
 * The await spans the whole generation, but the caller does NOT have to stay:
 * a client disconnect never kills the server invocation, so navigating away
 * simply means learning the outcome from the notification instead of the page.
 * If the invocation itself dies (deploy, platform kill), the row is left
 * PENDING and visible as "generando"; after PENDING_STALE_MS the same
 * submission reclaims and retries it, so a lost response can never again look
 * like "nothing happened".
 *
 * NOTE (deploy): live calls measured 15-32s; Netlify's synchronous ceiling is
 * 60s. The Anthropic client carries its own 50s timeout and one-retry cap.
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

    // Same bounds as the PDF routes: a date-only value is the whole local day in
    // APP_TIME_ZONE. These Dates also feed the idempotency key below.
    const parseDate = (k: "from" | "to"): Date | null | "invalid" => {
      const raw = String(formData.get(k) ?? "").trim();
      if (!raw) return null;
      return parseRangeValue(raw, k);
    };
    const from = parseDate("from");
    const to = parseDate("to");
    if (from === "invalid" || to === "invalid") return { ok: false, error: "Rango de fechas invalido." };

    // Tenant + archived scoping happens inside assembleReportData.
    const data = await assembleReportData({ id: user.id, companyId: user.companyId, role: user.role }, scope, from, to);
    if (!data) return { ok: false, error: "No autorizado." };

    // M2: a resubmitted identical request must never bill a second generation
    // or leave a second row. The key is derived server-side from the inputs, so
    // a client cannot forge or opt out of it.
    const idempotencyKey = buildInformeIdempotencyKey({
      requesterId: requester.id,
      projectId: data.project.id,
      scopeType: scope.type,
      scopeId: scope.id,
      archetype,
      brief,
      from,
      to,
    });
    // Resolve who owns this key. Exactly one invocation may generate at a time:
    // - READY: done, return it (no charge).
    // - PENDING and fresh: another invocation is generating right now (no charge).
    // - PENDING and stale / FAILED: reclaim via a guarded updateMany — the
    //   WHERE re-checks the reclaimable state, so two concurrent reclaims
    //   resolve to exactly one owner.
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PENDING_STALE_MS);
    let informeId: string | null = null;

    const existing = await prisma.informe.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true, startedAt: true },
    });
    if (existing) {
      if (existing.status === "READY") return { ok: true, informeId: existing.id, status: "READY" };
      if (existing.status === "PENDING" && (existing.startedAt ?? now) > staleBefore) {
        return { ok: true, informeId: existing.id, status: "PENDING" };
      }
      const claimed = await prisma.informe.updateMany({
        where: {
          id: existing.id,
          OR: [{ status: "FAILED" }, { status: "PENDING", startedAt: { lt: staleBefore } }],
        },
        data: { status: "PENDING", startedAt: now, errorMessage: null },
      });
      if (claimed.count !== 1) return { ok: true, informeId: existing.id, status: "PENDING" };
      informeId = existing.id;
    } else {
      try {
        informeId = (await prisma.informe.create({
          data: {
            projectId: data.project.id,
            segmentId: scope.type === "segment" ? scope.id : null,
            partidaId: scope.type === "partida" ? scope.id : null,
            requestedById: requester.id,
            archetype,
            brief,
            periodFrom: from,
            periodTo: to,
            contentMd: "",
            model: INFORME_MODEL,
            idempotencyKey,
            status: "PENDING",
            startedAt: now,
          },
          select: { id: true },
        })).id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const winner = await prisma.informe.findUnique({ where: { idempotencyKey }, select: { id: true, status: true } });
          if (winner) {
            return { ok: true, informeId: winner.id, status: winner.status === "READY" ? "READY" : "PENDING" };
          }
        }
        throw e;
      }
      revalidatePath(`/app/projects/${data.project.id}`);
    }

    const notifyBase = {
      companyId: user.companyId,
      actorId: requester.id,
      includeActor: true,
      recipientIds: [requester.id],
      projectId: data.project.id,
      link: `/app/projects/${data.project.id}?tab=informes`,
    };

    try {
      const contentMd = await generateInformeContent(buildInformeSystem(archetype), buildInformeUserMessage(data, brief));
      await prisma.informe.update({
        where: { id: informeId },
        data: { contentMd, status: "READY", generatedAt: new Date(), errorMessage: null },
      });
      await notifyEvent({
        ...notifyBase,
        key: "informe.ready",
        title: `Informe listo: ${data.scopeLabel}`,
        body: brief.length > 140 ? `${brief.slice(0, 140)}…` : brief,
      });
      revalidatePath(`/app/projects/${data.project.id}`);
      return { ok: true, informeId, status: "READY" };
    } catch (e) {
      const message = mapGenerationError(e);
      // Best-effort: if even this write fails the row stays PENDING and the
      // stale-reclaim path recovers it on the next attempt.
      await prisma.informe.update({
        where: { id: informeId },
        data: { status: "FAILED", errorMessage: message },
      }).catch(() => {});
      await notifyEvent({
        ...notifyBase,
        key: "informe.failed",
        title: `No se pudo generar el informe: ${data.scopeLabel}`,
        body: message,
      }).catch(() => {});
      revalidatePath(`/app/projects/${data.project.id}`);
      return { ok: false, error: message };
    }
  } catch (e) {
    // Failures before a row exists (auth, validation, seal, data assembly).
    return { ok: false, error: mapGenerationError(e) };
  }
}
