// Picks the real or mock ledger at call time (MOCK_CHAIN=1 -> mock).
// Import chain functions from here, not from ledger.ts / mockLedger.ts directly.
import * as real from "./ledger";
import * as mock from "./mockLedger";
import { issuerAddress } from "./slip";

export const DEFAULT_RPC = "https://testnet-rpc.monad.xyz";

export const isMockChain = () => process.env.MOCK_CHAIN === "1";
export const rpcUrl = () => process.env.MONAD_RPC_URL || DEFAULT_RPC;

const ledger = () => (isMockChain() ? mock : real);

export const anchor = (digest: string) => ledger().anchor(digest);
export const lookup = (txHash: string) => ledger().lookup(txHash);
export const latestTimestamp = () => ledger().latestTimestamp();

export function issuerAddressOrNull(): string | null {
  try {
    return issuerAddress();
  } catch {
    return null;
  }
}

export type { LookupResult } from "./ledger";
