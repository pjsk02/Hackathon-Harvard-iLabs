import { isHexString } from "ethers";
import type { HealthResponse } from "../shared/contract";
import { CHAIN_ID } from "../shared/contract";
import * as chain from "./chain";
import { verifyIssuerSigning } from "./chain/slip";
import { llmConfigured } from "./agent/llm";

const dependencies = {
  signing: verifyIssuerSigning, latestReference: chain.latestReference,
  isMock: chain.isMockChain, issuer: chain.issuerAddressOrNull, rpc: chain.rpcUrl,
  budget: chain.budgetStatus, aiConfigured: llmConfigured,
};

/** On-demand diagnostics only. Coalesces concurrent reads; never sends a transaction or calls Claude. */
export function createReadinessCheck(deps = dependencies, ttlMs = 5000) {
  let cached: { value: HealthResponse; expires: number } | null = null;
  let inFlight: Promise<HealthResponse> | null = null;
  return async function check(): Promise<HealthResponse> {
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    if (!inFlight) inFlight = (async () => {
      const mockChain = deps.isMock();
      const [signing, reference] = await Promise.allSettled([
        deps.signing(),
        mockChain ? Promise.resolve(null) :
          chain.withChainDeadline(Date.now() + 5000, () => deps.latestReference()),
      ]);
      const ref = reference.status === "fulfilled" ? reference.value : null;
      const connected = !!ref && ref.chainId === CHAIN_ID &&
        Number.isSafeInteger(ref.blockNumber) && ref.blockNumber >= 0 &&
        Number.isSafeInteger(ref.blockTimestamp) && ref.blockTimestamp > 0 && isHexString(ref.blockHash, 32);
      let recording = { paused: true, remaining: 0, detail: "Recording allowance is unavailable; no sends are enabled." };
      try {
        const budget = deps.budget();
        const remaining = Math.max(0, budget.limit - budget.reserved);
        recording = {
          paused: budget.limit === 0, remaining,
          detail: budget.limit === 0 ? "Live recording is paused." :
            remaining === 0 ? "The recording allowance is exhausted." :
              `${remaining} approved recording slots remain.`,
        };
      } catch { /* Invalid allowance remains fail-closed, without exposing configuration values. */ }
      let rpc = "Configured RPC endpoint";
      try { rpc = new URL(deps.rpc()).origin; } catch { /* Never expose URL credentials or key-bearing paths. */ }
      const configured = deps.aiConfigured();
      const value: HealthResponse = {
        ok: true, mockChain, issuer: signing.status === "fulfilled" ? signing.value : deps.issuer(), rpc,
        readiness: {
          checkedAt: new Date().toISOString(),
          signing: signing.status === "fulfilled"
            ? { status: "verified", detail: "A local signature was created and verified. No transaction was sent." }
            : { status: "unavailable", detail: "The signing key is missing, invalid, or could not pass the local check." },
          monad: {
            status: mockChain ? "practice" : connected ? "connected" : "unavailable",
            chainId: connected ? ref!.chainId : null, blockNumber: connected ? ref!.blockNumber : null,
            detail: mockChain ? "Practice mode is not a live Monad connection." :
              connected ? "Monad testnet returned a verified finalized block." :
                "Monad testnet did not return a verifiable finalized block. Check status to retry.",
          },
          ai: { status: configured ? "configured" : "missing", detail: configured
            ? "Claude credentials are configured. This health check makes no paid AI call."
            : "Claude credentials are not configured." },
          recording,
        },
      };
      cached = { value, expires: Date.now() + (connected ? ttlMs : Math.min(ttlMs, 1500)) };
      return value;
    })().finally(() => { inFlight = null; });
    return structuredClone(await inFlight);
  };
}

export const checkReadiness = createReadinessCheck();
