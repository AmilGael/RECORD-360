import Anthropic from "@anthropic-ai/sdk";

// Locked decision D2: preserve the model whose grounding/archetype compliance
// was verified live. The request is bounded below Netlify's current 60-second
// synchronous ceiling and retries at most once so SDK retries cannot silently
// multiply the user-visible wait.
export const INFORME_MODEL = "claude-sonnet-4-6";
export const INFORME_MAX_TOKENS = 2048;
export const INFORME_TIMEOUT_MS = 50_000;
export const INFORME_MAX_RETRIES = 1;

/**
 * An Anthropic account with no remaining credit rejects every request with a
 * 400 invalid_request_error whose message names the credit balance — NOT a 401
 * and not a 429, so it lands in neither the auth nor the busy/retry branch.
 * Without this it degrades to the generic "try again" message, which is advice
 * that cannot succeed until the account is topped up. Verified live against the
 * real API: `400 {"type":"invalid_request_error","message":"Your credit balance
 * is too low to access the Anthropic API. Please go to Plans & Billing…"}`.
 */
export function isCreditExhaustedError(e: unknown): boolean {
  if (!(e instanceof Anthropic.APIError) || Number(e.status) !== 400) return false;
  return /credit balance is too low|plans\s*&\s*billing/i.test(String(e.message ?? ""));
}

export async function generateInformeContent(system: string, userMessage: string): Promise<string> {
  const client = new Anthropic({
    timeout: INFORME_TIMEOUT_MS,
    maxRetries: INFORME_MAX_RETRIES,
  }); // reads ANTHROPIC_API_KEY
  const res = await client.messages.create({
    model: INFORME_MODEL,
    // The prompt contract caps output at 900 words. 2048 tokens leaves safe
    // Spanish-language headroom without reserving twice the required output.
    max_tokens: INFORME_MAX_TOKENS,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new Error("El generador no devolvio contenido.");
  return text.text;
}
