import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseCategory, parseLocation, parseOfflineReminderDueAt } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";
import { UserError, type ServerErrorKey } from "@/lib/errors/user-error";
import type { SyncErrorCode } from "@/lib/offline/types";

const USER_ERROR_CODES: Partial<Record<ServerErrorKey, SyncErrorCode>> = {
  reminderInvalid: "reminder_invalid",
  reminderFuture: "reminder_future",
  locationTooLong: "location_too_long",
  categoryInvalid: "category_invalid",
  fileType: "file_type",
  fileTooBig: "file_too_big",
  fileTooMany: "file_too_many",
  fileTotalTooBig: "file_total",
  fileSaveFailed: "file_save",
  correctionTarget: "correction_target",
  replyTarget: "reply_target",
  capturedAtInvalid: "captured_at",
};

function rejected(code: SyncErrorCode, status: number) {
  return Response.json({ errorCode: code }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await requireFreshSession();
    const form = await request.formData();
    const partidaId = String(form.get("partidaId") ?? "");
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
    if (!idempotencyKey) return rejected("generic", 400);

    const partida = await prisma.partida.findFirst({
      where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    });
    if (!partida) return rejected("generic", 404);

    // Idempotency lookup SCOPED to the access-checked partida.
    // NEVER look up by idempotencyKey alone — that would allow cross-tenant replay (IDOR-via-dedup).
    const existing = await prisma.registro.findFirst({ where: { partidaId, idempotencyKey }, select: { id: true } });
    if (existing) return Response.json({ id: existing.id, deduped: true }, { status: 200 });

    const text = (String(form.get("text") ?? "").trim()) || null;
    const category = parseCategory(form.get("category"));
    const latRaw = form.get("gpsLat"); const lngRaw = form.get("gpsLng");
    const gpsLat = latRaw ? Number(latRaw) : null;
    const gpsLng = lngRaw ? Number(lngRaw) : null;

    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    const attachments = await prepareAttachments(files, storage);

    const locationLabel = parseLocation(form.get("location"));
    let locationId: string | null = null;
    if (locationLabel) {
      const loc = await prisma.location.upsert({
        where: { projectId_label: { projectId: partida.projectId, label: locationLabel } },
        create: { projectId: partida.projectId, label: locationLabel }, update: {},
      });
      locationId = loc.id;
    }

    const corrRaw = form.get("correctionOfId");
    const correctionOfId = typeof corrRaw === "string" && corrRaw.trim() ? corrRaw.trim() : null;
    if (correctionOfId && !(await prisma.registro.findFirst({ where: { id: correctionOfId, partidaId }, select: { id: true } })))
      return rejected("correction_target", 400);

    const repRaw = form.get("replyToId");
    const replyToId = typeof repRaw === "string" && repRaw.trim() ? repRaw.trim() : null;
    if (replyToId && !(await prisma.registro.findFirst({ where: { id: replyToId, partidaId }, select: { id: true } })))
      return rejected("reply_target", 400);

    const capRaw = String(form.get("clientCapturedAt") ?? "").trim();
    const clientCapturedAt = capRaw ? new Date(capRaw) : null;
    if (clientCapturedAt && Number.isNaN(clientCapturedAt.getTime()))
      return rejected("captured_at", 400);

    // Offline-specific reminder rule (R3 WS10 §5): a reminder that was still in
    // the future when the device captured it is accepted even if it is past
    // due by the time the queued item reaches the server.
    const reminderDueAt = parseOfflineReminderDueAt(form.get("reminderDueAt"), clientCapturedAt);

    const rec = await appendRegistro({
      partidaId, authorId: user.id, category, text, progressPct: null,
      gpsLat, gpsLng, locationId, attachments, correctionOfId, replyToId, reminderDueAt,
      idempotencyKey, clientCapturedAt,
    });
    revalidatePath(`/app/projects/${partida.projectId}`);
    revalidatePath(`/app/partidas/${partidaId}`);
    revalidatePath("/app");
    return Response.json({ id: rec.id }, { status: 200 });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return rejected("session_expired", 401);
    if (e instanceof Error && e.message === "Forbidden") return rejected("forbidden", 403);
    if (e instanceof UserError) {
      const code = USER_ERROR_CODES[e.key] ?? "generic";
      if (code === "generic") console.error("[offline registro]", e);
      return rejected(code, 400);
    }
    console.error("[offline registro]", e);
    return rejected("generic", 400);
  }
}
