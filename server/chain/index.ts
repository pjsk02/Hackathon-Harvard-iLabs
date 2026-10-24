// Picks the real or mock ledger at call time (MOCK_CHAIN=1 -> mock).
// Import chain functions from here, not from ledger.ts / mockLedger.ts directly.
import * as real from "./ledger";
import * as mock from "./mockLedger";
import { issuerAddress } from "./slip";
import type { AnchorOptions, RecordingResult } from "./recording-types";

export const DEFAULT_RPC = "https://testnet-rpc.monad.xyz";

export const isMockChain = () => process.env.MOCK_CHAIN === "1";
export const rpcUrl = () => process.env.MONAD_RPC_URL || DEFAULT_RPC;

const ledger = () => (isMockChain() ? mock : real);

export const anchor = (digest: string, options: AnchorOptions = {}) => {
  if (isMockChain()) { options.beforeSend?.(); return mock.anchor(digest); }
  return real.anchor(digest, options);
};
export const lookup = (txHash: string) => ledger().lookup(txHash);
export const latestTimestamp = () => ledger().latestTimestamp();
export const latestReference = () => ledger().latestReference();

export function issuerAddressOrNull(): string | null {
  try {
    return issuerAddress();
  } catch {
    return null;
  }
}

export type { LookupResult } from "./ledger";
export type { ChainReference } from "./evidence";
export { stampMatchesRequest } from "./evidence";
export { withChainDeadline } from "./deadline";
export { createAttemptService } from "./attempts";
export type { AnchorOptions, RecordingResult } from "./recording-types";
export const budgetStatus = real.budgetStatus;
export const recordFingerprint = (digest: string, beforeSend: () => void): Promise<RecordingResult> =>
  isMockChain()
    ? Promise.resolve({ status: "failed", anchor: null, txHash: null, detail: "Attempt recording requires real Monad. No simulated record was created." })
    : real.recordFingerprint(digest, beforeSend);
export const reconcileFingerprint = (digest: string, hash: string): Promise<RecordingResult> =>
  isMockChain()
    ? Promise.resolve({ status: "failed", anchor: null, txHash: null, detail: "Attempt evidence cannot be verified in practice mode." })
    : real.reconcileFingerprint(digest, hash);
