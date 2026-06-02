import type { RegistroType } from "@prisma/client";
import type { Storage } from "@/lib/storage/types";
import { extensionForType } from "@/lib/storage/mime";
import { createHash } from "node:crypto";

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

export type PreparedAttachment = { fileType: "IMAGE"; url: string; sha256: string };

/**
 * Validate, content-hash, and store a list of uploaded images.
 * - Empty / 0-byte files are skipped.
 * - Disallowed MIME type → rejected before any bytes are stored.
 * - Storage failure → a generic error (never blamed on the file type).
 * Only IMAGE is wired this slice; large/other types come with presigned uploads.
 */
export async function prepareAttachments(files: File[], storage: Storage): Promise<PreparedAttachment[]> {
  const out: PreparedAttachment[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (!extensionForType(file.type)) {
      throw new Error("Tipo de archivo no permitido. Usa una imagen JPG, PNG, WEBP o GIF.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    let saved: { url: string; key: string };
    try {
      saved = await storage.put({ buffer, filename: file.name, contentType: file.type });
    } catch {
      throw new Error("No se pudo guardar el archivo. Inténtalo de nuevo.");
    }
    out.push({ fileType: "IMAGE", url: saved.url, sha256 });
  }
  return out;
}
