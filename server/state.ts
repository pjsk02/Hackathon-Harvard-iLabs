// State operations act on the request-local snapshot persisted by the repository.
// Internal isolated instances own their own snapshot and never copy the sender.
import type { AttemptEvidence, Receipt, Slip } from "../shared/contract";
import { CHAIN_ID } from "../shared/contract";
import { attemptAction, attemptAgent, attemptFingerprint, canonicalAttemptRecord } from "../shared/attempt-record";
import type { OriginalRequestContext } from "./chain/evidence";
import { AsyncLocalStorage } from "node:async_hooks";
import { httpError } from "./http";

export type StateSnapshot = {
  slips: Slip[]; contexts: [string, OriginalRequestContext][];
  receipts: Receipt[]; counter: number; nextId: number; generation: number;
};
export const emptySnapshot = (): StateSnapshot => ({ slips: [], contexts: [], receipts: [], counter: 0, nextId: 1, generation: 0 });
const fallback = emptySnapshot(); // Offline legacy tests only; HTTP uses isolated durable snapshots.
const workspaceState = new AsyncLocalStorage<StateSnapshot>();
const closedSnapshots = new WeakSet<StateSnapshot>();
const current = () => {
  const snapshot = workspaceState.getStore() ?? fallback;
  if (closedSnapshots.has(snapshot)) throw httpError(409, "This isolated state is closed.");
  return snapshot;
};
export const withSnapshot = <T>(snapshot: StateSnapshot, work: () => T): T => workspaceState.run(snapshot, work);
const requestGeneration = new AsyncLocalStorage<number>();

/** Capture once at the start of an operation; retry caches must include this value. */
export function getResetGeneration(): number {
  return current().generation;
}

// P1's permission-service consumes this name; both getters share one counter.
export const getGeneration = getResetGeneration;
// Compatibility for retired demo modules; not an access capability.
export const getSessionId = () => `retired-session-${getGeneration()}`;

export function isCurrentGeneration(expected: number): boolean {
  return expected === current().generation;
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
  if (getSlip(slip.mandate.mandateId)) throw httpError(409, "An issued permission cannot be replaced.");
  current().slips.push(slip);
  return slip;
}

export function getSlip(mandateId: string): Slip | undefined {
  return current().slips.find(s => s.mandate.mandateId === mandateId);
}

export function listSlips(): Slip[] {
  return [...current().slips];
}

export type NewReceipt = Omit<Receipt, "id" | "createdAt">;

export function addReceipt(input: NewReceipt, expectedGeneration?: number): Receipt {
  assertWritable(expectedGeneration);
  const receipt: Receipt = {
    id: `r_${String(current().nextId++).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  current().receipts.push(receipt);
  current().counter++;
  return receipt;
}

export function getReceipt(id: string): Receipt | undefined {
  return current().receipts.find((r) => r.id === id);
}

/** Publish the decision and its frozen request boundary as one synchronous write. */
export function addActionReceipt(input: NewReceipt, context: OriginalRequestContext, expectedGeneration: number): Receipt {
  assertWritable(expectedGeneration);
  const snapshot = current();
  const original = context?.originalSlip;
  const block = context?.requestBlock;
  const issued = original?.mandate && getSlip(original.mandate.mandateId);
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0 ||
      context?.generation !== expectedGeneration || !original || !block || !issued ||
      input.kind !== "action" || !["agent", "forced"].includes(input.source) ||
      !["ALLOWED", "BLOCKED"].includes(input.decision) ||
      (input.decision === "BLOCKED" && input.data !== null) ||
      input.mandateId !== original.mandate.mandateId || input.agentId !== context.agentId ||
      input.action !== context.action || input.actionTime !== block.blockTimestamp ||
      context.resource !== original.mandate.resource || context.scenarioId !== original.mandate.scenarioId ||
      JSON.stringify(issued) !== JSON.stringify(original) ||
      !Number.isSafeInteger(block.blockNumber) || block.blockNumber < 0 ||
      !Number.isSafeInteger(block.blockTimestamp) || block.blockTimestamp < 0 ||
      block.chainId !== CHAIN_ID || !/^0x[0-9a-f]{64}$/i.test(block.blockHash)) {
    throw httpError(409, "The action and original request context do not match this session.");
  }
  // All validation, cloning and allocation occur before any observable mutation.
  const saved = structuredClone(context);
  const receipt: Receipt = { ...input, id: `r_${String(snapshot.nextId).padStart(3, "0")}`, createdAt: new Date().toISOString() };
  const receipts = [...snapshot.receipts, receipt];
  const contexts: StateSnapshot["contexts"] = [...snapshot.contexts, [receipt.id, saved]];
  snapshot.receipts = receipts;
  snapshot.contexts = contexts;
  snapshot.nextId++;
  snapshot.counter++;
  return receipt;
}

export function saveRequestContext(receiptId: string, context: OriginalRequestContext): void {
  assertWritable(context.generation);
  const receipt = getReceipt(receiptId);
  if (!receipt || receipt.kind !== "action" || receipt.agentId !== context.agentId ||
      receipt.action !== context.action || receipt.actionTime !== context.requestBlock.blockTimestamp ||
      receipt.mandateId !== context.originalSlip.mandate.mandateId || getRequestContext(receiptId)) {
    throw httpError(409, "The original request context cannot be replaced.");
  }
  current().contexts.push([receiptId, structuredClone(context)]);
}

export function getRequestContext(receiptId: string): OriginalRequestContext | undefined {
  const context = current().contexts.find(([id]) => id === receiptId)?.[1];
  return context && context.generation === current().generation ? structuredClone(context) : undefined;
}

/** Updates audit metadata only; preserves the receipt identity, decision and counter. */
export function updateAttemptEvidence(receiptId: string, evidence: AttemptEvidence, generation: number): Receipt {
  assertWritable(generation);
  const receipt = getReceipt(receiptId);
  const record = canonicalAttemptRecord(evidence.record);
  const context = getRequestContext(receiptId);
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
  return [...current().receipts].reverse();
}

export function getCounter(): number {
  return current().counter;
}

export function reset(): void {
  // Increment before clearing. Work already in flight may complete on Monad, but
  // it must never repopulate the next demo session's in-memory state.
  const s = current();
  s.generation++;
  s.slips = [];
  s.receipts = [];
  s.contexts = [];
  s.counter = 0;
  s.nextId = 1;
}

/** Private in-memory state for internal orchestration; the chain sender is not copied. */
export function createIsolatedState() {
  const snapshot = emptySnapshot();
  const bind = <Args extends unknown[], Result>(fn: (...args: Args) => Result) =>
    (...args: Args): Result => withSnapshot(snapshot, () => fn(...args));
  return {
    getGeneration: bind(getGeneration), getResetGeneration: bind(getResetGeneration),
    isCurrentGeneration: bind(isCurrentGeneration), assertCurrentGeneration: bind(assertCurrentGeneration),
    withResetGeneration: <T>(generation: number, work: () => T): T =>
      withSnapshot(snapshot, () => withResetGeneration(generation, work)),
    getSlip: bind(getSlip), addSlip: bind(addSlip), listSlips: bind(listSlips),
    getReceipt: bind(getReceipt), addReceipt: bind(addReceipt), listReceipts: bind(listReceipts),
    addActionReceipt: bind(addActionReceipt), saveRequestContext: bind(saveRequestContext),
    getRequestContext: bind(getRequestContext), updateAttemptEvidence: bind(updateAttemptEvidence),
    getCounter: bind(getCounter), reset: bind(reset),
    close() {
      if (closedSnapshots.has(snapshot)) return;
      withSnapshot(snapshot, reset);
      closedSnapshots.add(snapshot);
    },
  };
}
