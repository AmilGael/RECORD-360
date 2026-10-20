import { getDict } from "@/i18n/server";
import { fillUserMessage, toUserMessage, type ServerErrorKey } from "@/lib/errors/user-error";

export type FormError = { error: string };

/** redirect() and notFound() throw. A form catch has to let them leave. */
export function isNextControlFlow(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND"));
}

export async function userText(key: ServerErrorKey, params?: Record<string, string | number>): Promise<string> {
  const { t } = await getDict();
  return fillUserMessage(t.serverErrors[key], params);
}

/** Runs a throwing action and returns the viewer's sentence, or null on success. */
export async function formResult(action: string, fn: () => Promise<void>): Promise<FormError | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    const { t } = await getDict();
    return { error: toUserMessage(e, t, action) };
  }
}
