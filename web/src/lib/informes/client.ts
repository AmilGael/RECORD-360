import Anthropic from "@anthropic-ai/sdk";

// Locked decision D2: claude-sonnet-4-6. thinking disabled + effort low keeps
// generation inside serverless time budgets (~10-30s at max_tokens 4096);
// quality-vs-speed retuning is a product decision, not a code default to drift.
export const INFORME_MODEL = "claude-sonnet-4-6";

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
