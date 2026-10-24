// In-memory slips and receipts (P3). One process, no database.
// Every restart or redeploy wipes this.
import type { AttemptEvidence, Receipt, Slip } from "../shared/contract";
import { attemptAction, attemptAgent, attemptFingerprint, canonicalAttemptRecord } from "../shared/attempt-record";
import type { OriginalRequestContext } from "./chain/evidence";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { httpError } from "./http";

const slips = new Map<string, Slip>();
const requestContexts = new Map<string, OriginalRequestContext>();
let receipts: Receipt[] = []; // stored oldest first
let counter = 0; // requests checked since last reset
let nextId = 1;
let resetGeneration = 0;
// Unlike a numeric generation, this also changes after a process restart.
// Exposed as HTTP metadata, not an authorization credential.
let sessionId = randomUUID();
const requestGeneration = new AsyncLocalStorage<number>();

export const getSessionId = () => sessionId;

/** Capture once at the start of an operation; retry caches must include this value. */
export function getResetGeneration(): number {
  return resetGeneration;
}

// P1's permission-service consumes this name; both getters share one counter.
export const getGeneration = getResetGeneration;

export function isCurrentGeneration(expected: number): boolean {
  return expected === resetGeneration;
}

export function assertCurrentGeneration(expected: number): void {
  const started = requestGeneration.getStore();
  if (!isCurrentGeneration(expected) || (started !== undefined && !isCurrentGeneration(started))) {
    throw httpError(409, "The session was reset; start this action again.");
  }
}

/** API middleware propagates the starting generation across awaits and queued work. */
export function withResetGeneration<T>(expected: number, work: () => T): T {
  assertCurrentGeneration(expected);
  return requestGeneration.run(expected, work);
}

function assertWritable(expected?: number): void {
  // Check BOTH tokens: passing a fresh token cannot override a stale HTTP context.
  const started = requestGeneration.getStore();
  if (started !== undefined) assertCurrentGeneration(started);
  if (expected !== undefined) assertCurrentGeneration(expected);
}

export function addSlip(slip: Slip, expectedGeneration?: number): Slip {
  assertWritable(expectedGeneration);
  slips.set(slip.mandate.mandateId, slip);
  return slip;
}

export function getSlip(mandateId: string): Slip | undefined {
  return slips.get(mandateId);
}

export function listSlips(): Slip[] {
  return [...slips.values()];
}

export type NewReceipt = Omit<Receipt, "id" | "createdAt">;

export function addReceipt(input: NewReceipt, expectedGeneration?: number): Receipt {
  assertWritable(expectedGeneration);
  const receipt: Receipt = {
    id: `r_${String(nextId++).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  receipts.push(receipt);
  counter++;
  return receipt;
}

export function getReceipt(id: string): Receipt | undefined {
  return receipts.find((r) => r.id === id);
}

export function saveRequestContext(receiptId: string, context: OriginalRequestContext): void {
  assertWritable(context.generation);
  const receipt = getReceipt(receiptId);
  if (!receipt || receipt.kind !== "action" || receipt.agentId !== context.agentId ||
      receipt.action !== context.action || receipt.actionTime !== context.requestBlock.blockTimestamp ||
      receipt.mandateId !== context.originalSlip.mandate.mandateId || requestContexts.has(receiptId)) {
    throw httpError(409, "The original request context cannot be replaced.");
  }
  requestContexts.set(receiptId, structuredClone(context));
}

export function getRequestContext(receiptId: string): OriginalRequestContext | undefined {
  const context = requestContexts.get(receiptId);
  return context ? structuredClone(context) : undefined;
}

/** Updates audit metadata only; preserves the receipt identity, decision and counter. */
export function updateAttemptEvidence(receiptId: string, evidence: AttemptEvidence, generation: number): Receipt {
  assertWritable(generation);
  const receipt = getReceipt(receiptId);
  const record = canonicalAttemptRecord(evidence.record);
  const context = requestContexts.get(receiptId);
  if (!receipt || receipt.kind !== "action" || !context ||
    record.receiptId !== receipt.id || record.source !== receipt.source || record.decision !== receipt.decision ||
    record.agent !== attemptAgent(receipt.agentId) || record.action !== attemptAction(receipt.action) ||
    record.requestBlock.blockTimestamp !== receipt.actionTime ||
    record.requestBlock.blockNumber !== context.requestBlock.blockNumber ||
    record.requestBlock.blockHash !== context.requestBlock.blockHash.toLowerCase() ||
    record.permissionFingerprint !== context.originalSlip.digest.toLowerCase() ||
    JSON.stringify(record.checks) !== JSON.stringify(receipt.checks.map(({ id, pass }) => ({ id, pass }))) ||
    attemptFingerprint(record) !== evidence.fingerprint) {
    throw httpError(409, "The attempt evidence does not match the original decision.");
  }
  const prior = receipt.attemptEvidence;
  if (prior && (prior.fingerprint !== evidence.fingerprint ||
    JSON.stringify(prior.record) !== JSON.stringify(record) ||
    (prior.txHash !== null && prior.txHash !== evidence.txHash) ||
    (prior.status !== "pending" && JSON.stringify(prior) !== JSON.stringify(evidence)))) {
    throw httpError(409, "The original attempt evidence cannot be replaced.");
  }
  receipt.attemptEvidence = structuredClone({ ...evidence, record });
  return receipt;
}

/** Newest first. */
export function listReceipts(): Receipt[] {
  return [...receipts].reverse();
}

export function getCounter(): number {
  return counter;
}

export function reset(): void {
  // Increment before clearing. Work already in flight may complete on Monad, but
  // it must never repopulate the next demo session's in-memory state.
  resetGeneration++;
  sessionId = randomUUID();
  slips.clear();
  receipts = [];
  requestContexts.clear();
  counter = 0;
  nextId = 1;
}
