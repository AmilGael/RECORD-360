import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseCategory, parseLocation } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import type { Role } from "@prisma/client";

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const partidaId = String(form.get("partidaId") ?? "");
  const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
  if (!idempotencyKey) return Response.json({ error: "idempotencyKey requerido" }, { status: 400 });

  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
  });
  if (!partida) return Response.json({ error: "Not found" }, { status: 404 });

  // Idempotency lookup SCOPED to the access-checked partida.
  // NEVER look up by idempotencyKey alone — that would allow cross-tenant replay (IDOR-via-dedup).
  const existing = await prisma.registro.findFirst({ where: { partidaId, idempotencyKey }, select: { id: true } });
  if (existing) return Response.json({ id: existing.id, deduped: true }, { status: 200 });

  try {
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
      return Response.json({ error: "Destino de corrección inválido." }, { status: 400 });

    const repRaw = form.get("replyToId");
    const replyToId = typeof repRaw === "string" && repRaw.trim() ? repRaw.trim() : null;
    if (replyToId && !(await prisma.registro.findFirst({ where: { id: replyToId, partidaId }, select: { id: true } })))
      return Response.json({ error: "Destino de respuesta inválido." }, { status: 400 });

    const remRaw = String(form.get("reminderDueAt") ?? "").trim();
    const reminderDueAt = remRaw ? new Date(remRaw) : null;
    if (reminderDueAt && Number.isNaN(reminderDueAt.getTime()))
      return Response.json({ error: "Recordatorio inválido." }, { status: 400 });

    const capRaw = String(form.get("clientCapturedAt") ?? "").trim();
    const clientCapturedAt = capRaw ? new Date(capRaw) : null;
    if (clientCapturedAt && Number.isNaN(clientCapturedAt.getTime()))
      return Response.json({ error: "Fecha de captura inválida." }, { status: 400 });

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
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo registrar." }, { status: 400 });
  }
}
