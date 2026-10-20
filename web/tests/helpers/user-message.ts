import { dictionaries } from "@/i18n/dictionaries";
import { toUserMessage } from "@/lib/errors/user-error";

/** The Spanish sentence a thrown error would show. Unknown errors become generic. */
export function thrownText(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return toUserMessage(e, dictionaries.es, "test");
  }
  throw new Error("expected a throw");
}

export async function rejectedText(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return toUserMessage(e, dictionaries.es, "test");
  }
  throw new Error("expected a throw");
}
