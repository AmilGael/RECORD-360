import path from "node:path";
import type { AttachmentType } from "@prisma/client";

// Allowlist of safe, inline-servable upload types. SVG is intentionally excluded
// (can carry executable script — stored-XSS vector). The stored extension and the
// served Content-Type are both derived from this allowlist — never from the
// user-supplied filename.
const ALLOWED: Record<string, { ext: string; kind: AttachmentType }> = {
  "image/jpeg": { ext: ".jpg", kind: "IMAGE" },
  "image/png": { ext: ".png", kind: "IMAGE" },
  "image/webp": { ext: ".webp", kind: "IMAGE" },
  "image/gif": { ext: ".gif", kind: "IMAGE" },
  "application/pdf": { ext: ".pdf", kind: "PDF" },
  "video/mp4": { ext: ".mp4", kind: "VIDEO" },
  "video/quicktime": { ext: ".mov", kind: "VIDEO" },
  "audio/mpeg": { ext: ".mp3", kind: "AUDIO" },
  "audio/mp4": { ext: ".m4a", kind: "AUDIO" },
  "audio/webm": { ext: ".weba", kind: "AUDIO" },
};

const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED).map(([type, { ext }]) => [ext, type]),
);

/** Extension for an allowed upload MIME type, or undefined if not allowed. */
export function extensionForType(contentType: string): string | undefined {
  return ALLOWED[contentType]?.ext;
}

/** AttachmentType (IMAGE/VIDEO/PDF/AUDIO) for an allowed MIME type, or undefined. */
export function attachmentKindForType(contentType: string): AttachmentType | undefined {
  return ALLOWED[contentType]?.kind;
}

/** Content-Type for a stored key, derived from its extension, or undefined. */
export function contentTypeForKey(key: string): string | undefined {
  const ext = path.extname(path.basename(key)).toLowerCase();
  return EXT_TO_TYPE[ext];
}
