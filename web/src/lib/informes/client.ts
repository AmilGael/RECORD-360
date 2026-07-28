import Anthropic from "@anthropic-ai/sdk";

// Locked decision D2: claude-sonnet-4-6. thinking disabled + effort low keeps
// generation inside serverless time budgets (~10-30s at max_tokens 4096);
// quality-vs-speed retuning is a product decision, not a code default to drift.
export const INFORME_MODEL = "claude-sonnet-4-6";

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
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.create({
    model: INFORME_MODEL,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text" || !text.text.trim()) throw new Error("El generador no devolvio contenido.");
  return text.text;
}
