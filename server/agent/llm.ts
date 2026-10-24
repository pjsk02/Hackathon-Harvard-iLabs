// Anthropic client (owner: P2). Replit AI Integrations first, own key as backup.
// Created lazily: never touch the network at boot.
import Anthropic from "@anthropic-ai/sdk";

export function llmClient(): Anthropic {
  const replitKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const replitUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (replitKey && process.env.USE_OWN_KEY !== "1") return new Anthropic({ apiKey: replitKey, baseURL: replitUrl });
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  throw new Error("No AI credentials. Add the Anthropic AI integration or ANTHROPIC_API_KEY.");
}

export const llmConfigured = () =>
  Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
