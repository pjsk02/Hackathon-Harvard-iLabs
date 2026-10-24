// Anthropic client (owner: P2). Replit AI Integrations first, own key as backup.
// Created lazily: never touch the network at boot.
import Anthropic from "@anthropic-ai/sdk";

export function providerOptions(env: Record<string, string | undefined>) {
  const common = { timeout: 8_000, maxRetries: 0 };
  const replitKey = env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const replitUrl = env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (replitKey && env.USE_OWN_KEY !== "1") {
    if (!replitUrl || new URL(replitUrl).protocol !== "https:") {
      throw new Error("The managed AI provider needs a valid HTTPS base URL.");
    }
    return { ...common, apiKey: replitKey, baseURL: replitUrl };
  }
  if (env.ANTHROPIC_API_KEY) return { ...common, apiKey: env.ANTHROPIC_API_KEY };
  throw new Error("No AI credentials. Add the Anthropic AI integration or ANTHROPIC_API_KEY.");
}

export function llmClient(): Anthropic {
  return new Anthropic(providerOptions(process.env));
}

export function llmConfigured(): boolean {
  try {
    providerOptions(process.env);
    return true;
  } catch {
    return false;
  }
}
