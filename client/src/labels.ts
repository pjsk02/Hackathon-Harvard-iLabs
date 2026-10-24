// All on-screen copy for the stage view. Keep every string short (about 6 words).
// Never use: mandate, gateway, digest, hash, EIP-712, nonce.
import type { Check, Decision, Slip } from "@shared/contract";
import { consulting } from "@shared/scenarios";

const S = consulting;

export const FIRM = S.firm.name; // McBain
export const CLIENT = S.client.name; // Goldman Stanley
export const AGENT = S.agent.name; // Atlas

export const COPY = {
  steps: ["Grant", "Clean example", "Injected example", "Monad evidence"],
  fictional: `${FIRM} and ${CLIENT} are fictional.`,
  headers: {
    firm: { name: FIRM.toUpperCase(), role: "consultant" },
    chain: { name: "Monad", role: "permissions on record" },
    client: { name: CLIENT, role: "client" },
  },
  chainSubtitle: "Permission links · application request history",
  empty: {
    firm: `${AGENT}, ${FIRM}'s AI agent, is ready.`,
    chain: "No permissions yet.",
    client: "Waiting for requests",
  },
  grant: {
    title: `Give ${AGENT} access to`,
    button: "Sign & put on Monad",
    busy: "Signing & recording on Monad…",
    reply: "✓ Access granted: regional branch profitability only.",
  },
  analyst: "Find the two weakest regions.",
  attachments: { clean: "Q3 Review · clean report", poisoned: "Q3 Review · injected report" },
  why: "Why: hidden text in the report told me to.",
  replies: {
    ALLOWED: "✓ Here's regional branch profitability.",
    BLOCKED: "✕ Blocked. Not permitted.",
    REJECTED: "✕ Permission review rejected. See the failed checks.",
  } as Record<Decision, string>,
  footers: { ALLOWED: "Sent to Atlas.", BLOCKED: "Nothing sent.", REJECTED: "Doesn't count." } as Record<Decision, string>,
  dispute: "We had permission on Monday.",
  asksFor: `${AGENT.toUpperCase()} ASKS FOR`,
  checking: "Checking Monad…",
  mayRead: `${AGENT} may read`,
  addedAfter: "Added after the request",
  previewLabel: "HIDDEN TEXT · included in extracted text",
  send: "Send",
  upload: {
    title: "Upload a report",
    sample: "Download sample Word report ↓",
    sampleHref: "/samples/Goldman-Stanley-Q3-Data-Request.docx",
  },
  forced: "forced",
};

/** Request bubble text, e.g. "Send me employee compensation." */
export function requestText(action: string): string {
  return `"Send me ${itemLabel(action).toLowerCase()}."`;
}

export function itemLabel(action: string): string {
  if (action === S.allowed.name) return S.allowed.label;
  if (action === S.forbidden.name) return S.forbidden.label;
  return action;
}

/** One-word names for the "earlier request" line. */
export function shortLabel(action: string): string {
  if (action === S.allowed.name) return "Profitability";
  if (action === S.forbidden.name) return "Compensation";
  return action;
}

export function permissionName(slip: Slip): string {
  return slip.label === "Original" ? "Permission #1" : "Permission #2";
}

/**
 * The three checks shown on stage (all five still run on the server).
 * agent and valid only appear when they fail.
 */
export function shownChecks(checks: Check[], action: string): { id: string; pass: boolean; text: string }[] {
  const item = itemLabel(action);
  const text: Record<string, [string, string]> = {
    signed: [`Signed by ${CLIENT}`, `Not signed by ${CLIENT}`],
    stamped: ["On Monad before the request", "Added to Monad after the request"],
    scope: [`${item} allowed`, `${item} not allowed`],
    agent: ["", "Wrong agent"],
    valid: ["", "Permission expired"],
  };
  const order = ["signed", "agent", "valid", "stamped", "scope"];
  return order
    .map((id) => checks.find((c) => c.id === id))
    .filter((c): c is Check => !!c && (c.pass ? ["signed", "stamped", "scope"].includes(c.id) : true))
    .map((c) => ({
      id: c.id,
      pass: c.pass,
      text: c.pass ? text[c.id][0] : c.detail || text[c.id][1],
    }));
}

export const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString();
export const weekday = (sec: number) => new Date(sec * 1000).toLocaleDateString(undefined, { weekday: "long" });

/** Atlas's answer line, built only from returned rows. */
export function answerFrom(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const rows = data as Record<string, unknown>[];
  const key = Object.keys(rows[0]).find((k) => /margin/i.test(k) && typeof rows[0][k] === "number");
  const nameKey = Object.keys(rows[0]).find((k) => typeof rows[0][k] === "string");
  if (!key || !nameKey) return null;
  const weakest = [...rows].sort((a, b) => (a[key] as number) - (b[key] as number)).slice(0, 2);
  return `Weakest: ${weakest.map((r) => `${r[nameKey]} ${r[key]}%`).join(", ")}`;
}
