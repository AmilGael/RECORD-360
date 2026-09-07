import type { Storage } from "@/lib/storage/types";
import { attachmentKindForType } from "@/lib/storage/mime";
import type { AttachmentType } from "@prisma/client";
import { createHash } from "node:crypto";

export type PreparedAttachment = { fileType: AttachmentType; url: string; sha256: string };

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 55 * 1024 * 1024;
// Per-type caps MUST stay below the Next server-action bodySizeLimit (next.config.ts,
// currently 60mb) so an oversize file is rejected here with a graceful message instead
// of the opaque framework body-limit error. Larger media (esp. video) needs the
// dedicated upload route / cloud storage planned in a later phase.
export const SIZE_CAP: Record<AttachmentType, number> = {
  IMAGE: 15 * 1024 * 1024,
  PDF: 30 * 1024 * 1024,
  AUDIO: 30 * 1024 * 1024,
  VIDEO: 50 * 1024 * 1024,
};

/**
 * Validate, content-hash, and store uploaded files (image / pdf / video / audio).
 * - Empty / 0-byte files are skipped.
 * - Disallowed MIME type → rejected before any bytes are stored.
 * - Over the per-type size cap → rejected.
 * - Storage failure → a generic error (never blamed on the file type).
 */
export async function prepareAttachments(files: File[], storage: Storage): Promise<PreparedAttachment[]> {
  if (files.length > MAX_FILES) {
    throw new Error(`Demasiados archivos (máx. ${MAX_FILES}).`);
  }
  const totalBytes = files.reduce((sum, file) => sum + (file?.size ?? 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("El tamaño total de los archivos supera el límite permitido.");
  }
  const out: PreparedAttachment[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    const kind = attachmentKindForType(file.type);
    if (!kind) {
      throw new Error("Tipo de archivo no permitido. Usa imagen, PDF, video o audio.");
    }
    if (file.size > SIZE_CAP[kind]) {
      throw new Error("Archivo demasiado grande.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    let saved: { url: string; key: string };
    try {
      saved = await storage.put({ buffer, filename: file.name, contentType: file.type });
    } catch {
      throw new Error("No se pudo guardar el archivo. Inténtalo de nuevo.");
    }
    out.push({ fileType: kind, url: saved.url, sha256 });
  }
  return out;
}
