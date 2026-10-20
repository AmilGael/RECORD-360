// Notification titles may carry a stored `link`. Only in-app paths are rendered
// as <a href>; anything that looks like a scheme, protocol-relative URL, or
// another site's path is plain text. Prefetching never marks read — this
// helper only decides whether a link is safe to render.

const CONTROL_OR_WHITESPACE = /[\s\u0000-\u001F\u007F]/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function isSafeNotificationLink(link: string | null | undefined): boolean {
  if (typeof link !== "string" || link.length === 0) return false;
  if (CONTROL_OR_WHITESPACE.test(link)) return false;
  if (link.includes("//") || link.includes("\\")) return false;
  if (SCHEME.test(link)) return false;
  return link === "/app" || link.startsWith("/app/") || link.startsWith("/app?");
}
