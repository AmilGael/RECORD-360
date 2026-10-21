/**
 * Display-only file name. Never used as a storage key or a Content-Disposition
 * header — those stay on the generated object name.
 */
const MAX = 200;

export function sanitizeFileName(name: string): string | null {
  const slash = name.replace(/\\/g, "/");
  const base = slash.split("/").pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX).trim() || null;
}
