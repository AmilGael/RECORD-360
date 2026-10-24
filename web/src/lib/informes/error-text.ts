import type { Dict } from "@/i18n/dictionaries";
import type { ServerErrorKey } from "@/lib/errors/user-error";
import { UserError } from "@/lib/errors/user-error";
import Anthropic from "@anthropic-ai/sdk";
import { isCreditExhaustedError } from "@/lib/informes/client";

/**
 * Sentences mapGenerationError used to store on Informe.errorMessage, before
 * the column held a key. Kept verbatim, including the missing accents, so a
 * row written by an older deploy still maps to the same reason.
 */
const LEGACY_INFORME_ERRORS: Record<string, ServerErrorKey> = {
  "El generador de informes no esta configurado (clave de API invalida).": "informeBadKey",
  "El servicio esta ocupado. Intentalo de nuevo en un momento.": "informeBusy",
  "El generador de informes no esta disponible: la cuenta de API no tiene saldo. Contacta al administrador.": "informeNoCredit",
  "No se pudo generar el informe. Intentalo de nuevo.": "informeFailed",
};

export function generationErrorKey(e: unknown): ServerErrorKey {
  if (e instanceof UserError) return e.key;
  if (e instanceof Anthropic.AuthenticationError) return "informeBadKey";
  if (
    e instanceof Anthropic.RateLimitError
    || e instanceof Anthropic.APIConnectionTimeoutError
    || (e instanceof Anthropic.APIError && Number(e.status) >= 529)
  ) {
    return "informeBusy";
  }
  if (isCreditExhaustedError(e)) return "informeNoCredit";
  return "informeFailed";
}

/** The FAILED-row sentence in the viewer's language. Unknown stored text is generic. */
export function informeErrorText(stored: string | null, t: Dict): string | null {
  if (!stored) return null;
  if (Object.prototype.hasOwnProperty.call(t.serverErrors, stored)) {
    return t.serverErrors[stored as ServerErrorKey];
  }
  const legacy = LEGACY_INFORME_ERRORS[stored];
  if (legacy) return t.serverErrors[legacy];
  return t.serverErrors.generic;
}
