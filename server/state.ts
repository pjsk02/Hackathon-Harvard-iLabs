// In-memory slips and receipts (P3). One process, no database.
// Every restart or redeploy wipes this.
import type { Receipt, Slip } from "../shared/contract";
import { AsyncLocalStorage } from "node:async_hooks";
import { httpError } from "./http";

const slips = new Map<string, Slip>();
let receipts: Receipt[] = []; // stored oldest first
let counter = 0; // requests checked since last reset
let nextId = 1;
let resetGeneration = 0;
const requestGeneration = new AsyncLocalStorage<number>();

/** Capture once at the start of an operation; retry caches must include this value. */
export function getResetGeneration(): number {
  return resetGeneration;
}

export function isCurrentGeneration(expected: number): boolean {
  return expected === resetGeneration;
}

export function assertCurrentGeneration(expected: number): void {
  if (!isCurrentGeneration(expected)) {
    throw httpError(409, "The demo was reset; start this action again.");
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
  slips.clear();
  receipts = [];
  counter = 0;
  nextId = 1;
}
