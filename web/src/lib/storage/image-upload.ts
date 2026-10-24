import type { Storage } from "./types";
import { UserError } from "@/lib/errors/user-error";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PNG_ONLY = ["image/png"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Upload a branded image (project cover, user photo, firma, company seal) and
 * return its storage key. Firma and seal are PNG-only (transparent/white
 * background contract from the architect); covers and photos allow jpeg/png/webp.
 * SVG stays excluded everywhere (stored-XSS vector).
 */
export async function uploadBrandedImage(
  file: File,
  storage: Storage,
  opts: { pngOnly?: boolean } = {},
): Promise<string> {
  const allowed = opts.pngOnly ? PNG_ONLY : IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    throw new UserError(opts.pngOnly ? "imagePng" : "imageType");
  }
  if (file.size > MAX_IMAGE_BYTES) throw new UserError("imageTooBig");
  const buffer = Buffer.from(await file.arrayBuffer());
  const { key } = await storage.put({ buffer, filename: file.name, contentType: file.type });
  return key;
}
