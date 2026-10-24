"use server";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseCategory, parseLocation, parseReminderDueAt } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";
import { projectAccessWhere } from "@/lib/authz/projects";
import { requireFreshSession } from "@/lib/auth/session";
import { userText } from "@/lib/errors/form-result";
import { toUserMessage } from "@/lib/errors/user-error";
import { getDict } from "@/i18n/server";

export type LogResult = { ok: true } | { ok: false; error: string };

export async function logRegistro(_prev: LogResult | null, formData: FormData): Promise<LogResult> {
  try {
    const user = await requireFreshSession();
    const authorId = user.id;

    const partidaId = String(formData.get("partidaId"));
    const partida = await prisma.partida.findFirst({
      where: { id: partidaId, deletedAt: null, project: projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) },
    });
    if (!partida) return { ok: false, error: await userText("unauthorized") };

    const text = (String(formData.get("text") ?? "").trim()) || null;
    const category = parseCategory(formData.get("category"));
    const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
    const gpsLat = latRaw ? Number(latRaw) : null;
    const gpsLng = lngRaw ? Number(lngRaw) : null;

    const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
    const attachments = await prepareAttachments(photos, storage);

    const locationLabel = parseLocation(formData.get("location"));
    let locationId: string | null = null;
    if (locationLabel) {
      const loc = await prisma.location.upsert({
        where: { projectId_label: { projectId: partida.projectId, label: locationLabel } },
        create: { projectId: partida.projectId, label: locationLabel },
        update: {},
      });
      locationId = loc.id;
    }

    const correctionRaw = formData.get("correctionOfId");
    const correctionOfId = typeof correctionRaw === "string" && correctionRaw.trim() ? correctionRaw.trim() : null;
    if (correctionOfId) {
      const corrected = await prisma.registro.findFirst({ where: { id: correctionOfId, partidaId }, select: { id: true } });
      if (!corrected) return { ok: false, error: await userText("correctionTarget") };
    }
    const replyRaw = formData.get("replyToId");
    const replyToId = typeof replyRaw === "string" && replyRaw.trim() ? replyRaw.trim() : null;
    if (replyToId) {
      const replied = await prisma.registro.findFirst({ where: { id: replyToId, partidaId }, select: { id: true } });
      if (!replied) return { ok: false, error: await userText("replyTarget") };
    }
    const reminderDueAt = parseReminderDueAt(formData.get("reminderDueAt"));

    await appendRegistro({ partidaId, authorId, category, text, progressPct: null, gpsLat, gpsLng, locationId, attachments, correctionOfId, replyToId, reminderDueAt });
    revalidatePath(`/app/projects/${partida.projectId}`);
    revalidatePath(`/app/partidas/${partidaId}`);
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    const { t } = await getDict();
    return { ok: false, error: toUserMessage(e, t, "logRegistro") };
  }
}
