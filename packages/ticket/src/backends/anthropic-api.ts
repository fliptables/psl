import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export async function generate(
  systemPrompt: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: model ?? DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: systemPrompt }],
  });

  const textBlocks = response.content.filter((b) => b.type === "text");
  return textBlocks.map((b) => b.text).join("\n");
}
