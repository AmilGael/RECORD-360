"use server";
import { auth } from "@/auth";
import { appendRegistro } from "@/lib/registro/append";
import { storage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export async function logRegistro(formData: FormData) {
  const session = await auth();
  const authorId = (session?.user as { id?: string })?.id;
  if (!authorId) throw new Error("Unauthorized");

  const partidaId = String(formData.get("partidaId"));
  const text = (String(formData.get("text") ?? "").trim()) || null;
  const progressRaw = formData.get("progressPct");
  const progressPct = progressRaw ? Number(progressRaw) : null;
  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  let mediaUrl: string | null = null;
  let type: "NOTE" | "PHOTO" = "NOTE";
  const photo = formData.get("photo") as File | null;
  if (photo && photo.size > 0) {
    const buffer = Buffer.from(await photo.arrayBuffer());
    try {
      const saved = await storage.put({ buffer, filename: photo.name, contentType: photo.type });
      mediaUrl = saved.url; type = "PHOTO";
    } catch {
      throw new Error("Tipo de archivo no permitido. Usa una imagen JPG, PNG, WEBP o GIF.");
    }
  }

  await appendRegistro({ partidaId, authorId, type, text, mediaUrl, progressPct, gpsLat, gpsLng });
  revalidatePath(`/partidas/${partidaId}`);
}
