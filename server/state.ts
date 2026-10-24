// In-memory slips and receipts (P3). One process, no database.
// Every restart or redeploy wipes this.
import type { Receipt, Slip } from "../shared/contract";

const slips = new Map<string, Slip>();
let receipts: Receipt[] = []; // stored oldest first
let counter = 0; // requests checked since last reset
let nextId = 1;

export function addSlip(slip: Slip): Slip {
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

export function addReceipt(input: NewReceipt): Receipt {
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
  slips.clear();
  receipts = [];
  counter = 0;
  nextId = 1;
}
