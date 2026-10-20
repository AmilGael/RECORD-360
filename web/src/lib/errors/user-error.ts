import type { Dict } from "@/i18n/dictionaries";

export type ServerErrorKey = keyof Dict["serverErrors"];

/**
 * A failure the user can act on. The message is a dictionary key, never a
 * sentence, so the action that catches it can render the viewer's language.
 */
export class UserError extends Error {
  readonly key: ServerErrorKey;
  readonly params?: Record<string, string | number>;

  constructor(key: ServerErrorKey, params?: Record<string, string | number>) {
    super(key);
    this.name = "UserError";
    this.key = key;
    this.params = params;
  }
}

export function fillUserMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (params[name] == null ? "" : String(params[name])));
}

// requireFreshSession and the project guards throw these exact words so route
// handlers can choose 401/403. They are not sentences for the screen.
const ACCESS_SENTINELS = new Set(["Unauthorized", "Forbidden"]);

/**
 * The sentence to show. A UserError uses its key. The two access sentinels
 * become the same "not allowed" line, so a catch cannot leak which one it was.
 * Anything else is logged and replaced: a Prisma or library message never
 * reaches the screen.
 */
export function toUserMessage(e: unknown, t: Dict, action: string): string {
  if (e instanceof UserError) return fillUserMessage(t.serverErrors[e.key], e.params);
  if (e instanceof Error && ACCESS_SENTINELS.has(e.message)) return t.serverErrors.unauthorized;
  console.error(`[${action}]`, e);
  return t.serverErrors.generic;
}
