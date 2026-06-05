"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseProgressPct, parseCategory, parseLocation } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export type LogResult = { ok: true } | { ok: false; error: string };

export async function logRegistro(_prev: LogResult | null, formData: FormData): Promise<LogResult> {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; companyId?: string } | undefined;
    if (!user?.id || !user.companyId) return { ok: false, error: "No autorizado." };
    const authorId = user.id;

    const partidaId = String(formData.get("partidaId"));
    const partida = await prisma.partida.findFirst({
      where: { id: partidaId, project: { companyId: user.companyId } },
    });
    if (!partida) return { ok: false, error: "No autorizado." };

    const text = (String(formData.get("text") ?? "").trim()) || null;
    const progressPct = parseProgressPct(formData.get("progressPct"));
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
      if (!corrected) return { ok: false, error: "Invalid correction target" };
    }

    await appendRegistro({ partidaId, authorId, category, text, progressPct, gpsLat, gpsLng, locationId, attachments, correctionOfId });
    revalidatePath(`/app/partidas/${partidaId}`);
    return { ok: true };
  } catch (e) {
    // parse* validators throw user-facing Spanish messages; surface them.
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo registrar." };
  }
}
