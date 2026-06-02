"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appendRegistro } from "@/lib/registro/append";
import { parseProgressPct } from "@/lib/registro/validate";
import { prepareMedia } from "@/lib/registro/upload";
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
  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photo = formData.get("photo") as File | null;
  const { mediaUrl, type } = await prepareMedia(photo, storage);

  await appendRegistro({ partidaId, authorId, type, text, mediaUrl, progressPct, gpsLat, gpsLng });
  revalidatePath(`/app/partidas/${partidaId}`);
}
