// STUB (owner: P1). Replace with the real Monad ledger (see the monad-anchor skill).
// Frozen interface: anchor, lookup, latestTimestamp. No network calls at import time.
import type { Anchor } from "../../shared/contract";

export type LookupResult = {
  from: string;
  data: string;
  blockNumber: number;
  blockTimestamp: number;
  status: number;
};

const NOT_BUILT = "The Monad connection is not built yet. Set MOCK_CHAIN=1 to use the mock.";

export async function anchor(_digest: string): Promise<Anchor> {
  throw new Error(NOT_BUILT);
}

export async function lookup(_txHash: string): Promise<LookupResult | null> {
  throw new Error(NOT_BUILT);
}

export async function latestTimestamp(): Promise<number> {
  return Math.floor(Date.now() / 1000);
}
