// Anthropic client (owner: P2). Replit AI Integrations first, own key as backup.
// Created lazily: never touch the network at boot.
import Anthropic from "@anthropic-ai/sdk";

export function llmClient(): Anthropic {
  const replitKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const replitUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (replitKey && process.env.USE_OWN_KEY !== "1") {
    if (!replitUrl) throw new Error("The managed Anthropic connection is incomplete.");
    return new Anthropic({ apiKey: replitKey, baseURL: replitUrl, maxRetries: 0, timeout: 8000 });
  }
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 8000 });
  throw new Error("No AI credentials. Add the Anthropic AI integration or ANTHROPIC_API_KEY.");
}

export const llmConfigured = () => process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.USE_OWN_KEY !== "1"
  ? Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL)
  : Boolean(process.env.ANTHROPIC_API_KEY);
