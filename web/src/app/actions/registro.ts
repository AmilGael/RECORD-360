"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseProgressPct, parseCategory, parseLocation } from "@/lib/registro/validate";
import { prepareAttachments } from "@/lib/registro/upload";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export async function logRegistro(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string } | undefined;
  if (!user?.id || !user.companyId) throw new Error("Unauthorized");
  const authorId = user.id;

  const partidaId = String(formData.get("partidaId"));
  // Cross-tenant guard: the partida must belong to the caller's company.
  const partida = await prisma.partida.findFirst({
    where: { id: partidaId, project: { companyId: user.companyId } },
  });
  if (!partida) throw new Error("Forbidden");

  const text = (String(formData.get("text") ?? "").trim()) || null;
  const progressPct = parseProgressPct(formData.get("progressPct"));
  const category = parseCategory(formData.get("category"));
  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File);
  const attachments = await prepareAttachments(photos, storage);

  // Pick-or-create the location, scoped to the project; empty label → no location.
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

  await appendRegistro({ partidaId, authorId, category, text, progressPct, gpsLat, gpsLng, locationId, attachments });
  revalidatePath(`/app/partidas/${partidaId}`);
}
