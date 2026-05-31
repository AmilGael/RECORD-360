import path from "node:path";

// Allowlist of safe, inline-renderable raster image types. SVG is intentionally
// excluded because it can carry executable script (stored-XSS vector). The
// stored file extension and the served Content-Type are both derived from this
// allowlist — never from the user-supplied filename.
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const EXT_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_IMAGE_TYPES).map(([type, ext]) => [ext, type]),
);

/** Extension for an allowed upload MIME type, or undefined if not allowed. */
export function extensionForType(contentType: string): string | undefined {
  return ALLOWED_IMAGE_TYPES[contentType];
}

/** Content-Type for a stored key, derived from its extension, or undefined. */
export function contentTypeForKey(key: string): string | undefined {
  const ext = path.extname(path.basename(key)).toLowerCase();
  return EXT_TO_TYPE[ext];
}
