import type { RegistroType } from "@prisma/client";
import type { Storage } from "@/lib/storage/types";
import { extensionForType } from "@/lib/storage/mime";

export type PreparedMedia = { mediaUrl: string | null; type: RegistroType };

/**
 * Validate and store an optional uploaded photo.
 * - No (or empty) file → a plain NOTE with no media.
 * - Disallowed MIME type → rejected up front, before reading/storing the bytes.
 * - Storage failure → a generic error, so we never blame the file type for an
 *   unrelated infrastructure problem.
 */
export async function prepareMedia(photo: File | null, storage: Storage): Promise<PreparedMedia> {
  if (!photo || photo.size === 0) return { mediaUrl: null, type: "NOTE" };

  if (!extensionForType(photo.type)) {
    throw new Error("Tipo de archivo no permitido. Usa una imagen JPG, PNG, WEBP o GIF.");
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  let saved: { url: string; key: string };
  try {
    saved = await storage.put({ buffer, filename: photo.name, contentType: photo.type });
  } catch {
    throw new Error("No se pudo guardar el archivo. Inténtalo de nuevo.");
  }
  return { mediaUrl: saved.url, type: "PHOTO" };
}
