// Mock ledger (owner: P1). Same interface as ledger.ts, no network. Used when MOCK_CHAIN=1.
import { issuerAddress } from "./slip";
import type { Anchor } from "../../shared/contract";
import type { LookupResult } from "./ledger";

const store = new Map<string, { data: string; ts: number; block: number }>();
let block = 18_442_000;

export async function anchor(digest: string): Promise<Anchor> {
  const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const ts = Math.floor(Date.now() / 1000);
  block += 1;
  store.set(txHash, { data: digest, ts, block });
  return { txHash, blockNumber: block, blockTimestamp: ts, explorerUrl: "#mock" };
}

export async function lookup(txHash: string): Promise<LookupResult | null> {
  const r = store.get(txHash);
  if (!r) return null;
  // `from` must equal the issuer, or "stamped" always fails on the mock
  return { from: issuerAddress(), data: r.data, blockNumber: r.block, blockTimestamp: r.ts, status: 1 };
}

export async function latestTimestamp(): Promise<number> {
  return Math.floor(Date.now() / 1000);
}
