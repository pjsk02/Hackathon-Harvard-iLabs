// P2 orchestration only. The production isolated-state adapter is NOT yet delivered.
import type { Receipt, SelftestResponse, Slip } from "../../shared/contract";
import { AGENT_ID, AMENDED_MANDATE_ID, MANDATE_ID, RESOURCE } from "../../shared/contract";
import { consulting } from "../../shared/scenarios";
import { digestOf, issuerAddress, recoverSigner } from "../chain/slip";
import { HttpError, httpError } from "../http";

export type SelftestEvidence = "offline-fixture" | "mock" | "live-finalized";

// A server-side seam, not an HTTP contract or proof of isolation. Its production
// implementation must come from the reviewed P3 factory and P1 permission service.
export type SceneClient = {
  reset(): Promise<unknown>;
  createSlip(): Promise<Slip>;
  act(action: string): Promise<Receipt>;
  dispute(): Promise<Receipt>;
  getSlip(id: string): Slip | undefined;
  verifyStamp(slip: Slip): Promise<void>;
};

const order = ["signed", "agent", "valid", "stamped", "scope"] as const;
function requireResult(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new SceneMismatch(reason);
}
class SceneMismatch extends Error {}

function checkRows(receipt: Receipt, failed: string[]) {
  requireResult(Array.isArray(receipt.checks) && receipt.checks.length === order.length &&
    receipt.checks.every((check, index) =>
      check.id === order[index] && check.pass === !failed.includes(check.id) &&
      typeof check.label === "string" && typeof check.detail === "string" &&
      (check.pass ? check.detail === "" : check.detail.length > 0)),
  "The five ordered permission checks did not match.");
}

function signedSlip(slip: Slip, id: string, label: Slip["label"]) {
  requireResult(slip && slip.label === label && slip.mandate.mandateId === id &&
    slip.mandate.agentId === AGENT_ID && slip.mandate.resource === RESOURCE &&
    slip.mandate.scenarioId === consulting.id, "The permission identity did not match.");
  const issuer = issuerAddress().toLowerCase();
  requireResult(slip.mandate.issuer.toLowerCase() === issuer &&
    recoverSigner(slip.mandate, slip.signature).toLowerCase() === issuer &&
    digestOf(slip.mandate).toLowerCase() === slip.digest.toLowerCase(),
  "The permission signature or fingerprint did not verify.");
  requireResult(slip.anchor && /^0x[a-f0-9]{64}$/i.test(slip.anchor.txHash) &&
    Number.isSafeInteger(slip.anchor.blockNumber) && slip.anchor.blockNumber >= 0 &&
    Number.isSafeInteger(slip.anchor.blockTimestamp) && slip.anchor.blockTimestamp >= 0,
  "The permission has no verifiable stamp.");
}

function actionReceipt(receipt: Receipt, slip: Slip, action: string, decision: Receipt["decision"]) {
  requireResult(receipt && receipt.kind === "action" && receipt.source === "forced" &&
    receipt.agentId === AGENT_ID && receipt.mandateId === slip.mandate.mandateId &&
    receipt.action === action && receipt.decision === decision &&
    typeof receipt.id === "string" && receipt.id.length > 0 &&
    receipt.explorerUrl === slip.anchor!.explorerUrl &&
    Number.isSafeInteger(receipt.actionTime) && receipt.actionTime >= slip.mandate.issuedAt &&
    receipt.actionTime < slip.mandate.expiresAt, "The forced request identity or result did not match.");
}

function marginsShape(data: unknown): boolean {
  if (!Array.isArray(data) || data.length !== 4) return false;
  const regions = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== "object" ||
        Object.keys(row).sort().join(",") !== "changePts,marginPct,region,revenueM" ||
        typeof row.region !== "string" || !row.region || regions.has(row.region) ||
        ![row.revenueM, row.marginPct, row.changePts].every(Number.isFinite)) return false;
    regions.add(row.region);
  }
  return true;
}

function safeFailure(error: unknown, operation: string): string {
  if (error instanceof SceneMismatch) return error.message;
  // Never echo an RPC/model/provider message, URL, transaction payload or stack.
  if (error instanceof HttpError) {
    if (error.status === 409) return `${operation}: the isolated session changed or an operation is still running.`;
    if (error.status === 503) return `${operation}: a required signing, finalized-evidence or context dependency is unavailable.`;
    if (error.status === 504) return `${operation}: the verification deadline was exceeded.`;
  }
  return `${operation}: verification failed; no success is claimed.`;
}

export async function runSelftest(
  client: SceneClient, evidence: SelftestEvidence = "offline-fixture", signal?: AbortSignal,
): Promise<SelftestResponse> {
  const active = () => { if (signal?.aborted) throw httpError(504, "The self-test verification deadline was exceeded."); };
  let original: Slip;
  let blocked: Receipt;
  let allowedId: string;
  const expectedStamp = evidence === "live-finalized"
    ? "Signed permission; finalized stamp verified"
    : `Signed permission; ${evidence} stamp only, not live evidence`;
  const scenes = [
    {
      scene: `1 Permission slip (${evidence})`, expected: expectedStamp,
      run: async () => {
        active(); await client.reset(); active();
        original = structuredClone(await client.createSlip()); active();
        signedSlip(original, MANDATE_ID, "Original");
        requireResult(original.mandate.allowedActions.length === 1 &&
          original.mandate.allowedActions[0] === consulting.allowed.name, "The original permission scope did not match.");
        await client.verifyStamp(original); active();
      },
    },
    {
      scene: "2a Regional margins", expected: "ALLOWED with four regional margin rows",
      run: async () => {
        active(); const receipt = await client.act(consulting.allowed.name); active();
        actionReceipt(receipt, original, consulting.allowed.name, "ALLOWED");
        checkRows(receipt, []);
        requireResult(marginsShape(receipt.data), "The allowed request did not return four valid regional margin rows.");
        allowedId = receipt.id;
      },
    },
    {
      scene: "2b Employee salaries", expected: "BLOCKED; scope only; data null",
      run: async () => {
        active(); blocked = structuredClone(await client.act(consulting.forbidden.name)); active();
        actionReceipt(blocked, original, consulting.forbidden.name, "BLOCKED");
        checkRows(blocked, ["scope"]);
        requireResult(blocked.data === null && blocked.id !== allowedId, "The blocked request data or receipt identity did not match.");
      },
    },
    {
      scene: "3 Amended permission", expected: "REJECTED; stamped only; data null",
      run: async () => {
        active(); const receipt = await client.dispute(); active();
        const candidate = client.getSlip(AMENDED_MANDATE_ID);
        requireResult(candidate, "The amended permission is missing.");
        signedSlip(candidate, AMENDED_MANDATE_ID, "Amended");
        requireResult(candidate.digest !== original.digest &&
          candidate.mandate.allowedActions.includes(consulting.forbidden.name) &&
          candidate.mandate.expiresAt === original.mandate.expiresAt, "The signed amendment did not match the dispute.");
        await client.verifyStamp(candidate); active();
        requireResult(receipt.kind === "dispute" && receipt.source === "forced" &&
          receipt.decision === "REJECTED" && receipt.data === null &&
          receipt.agentId === blocked.agentId && receipt.action === blocked.action &&
          receipt.actionTime === blocked.actionTime && receipt.mandateId === AMENDED_MANDATE_ID &&
          receipt.explorerUrl === candidate.anchor!.explorerUrl &&
          receipt.id !== blocked.id && receipt.id !== allowedId,
        "The dispute did not retain the original request identity, time or null data.");
        checkRows(receipt, ["stamped"]);
        requireResult(receipt.checks[3].detail === "Stamped on Monad after this request",
          "The dispute did not establish a verified late permission.");
      },
    },
  ];
  const steps: SelftestResponse["steps"] = [];
  for (const { scene, expected, run } of scenes) {
    active();
    const started = performance.now();
    let got = expected;
    try { await run(); } catch (error) { got = safeFailure(error, scene); }
    active();
    steps.push({ scene, expected, got, ms: Math.max(0, Math.round(performance.now() - started)) });
    if (got !== expected) break;
  }
  return { pass: steps.length === scenes.length && steps.every((step) => step.got === step.expected), steps };
}
