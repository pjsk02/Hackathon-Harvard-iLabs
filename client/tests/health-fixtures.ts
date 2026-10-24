import type { HealthResponse } from "../../shared/contract";

/** Real-shaped response, fabricated entirely in the browser/unit fixture. No checks are executed. */
export function verifiedHealth(): HealthResponse {
  return {
    ok: true, mockChain: false, issuer: `0x${"56".repeat(20)}`, rpc: "https://rpc.fixture.invalid",
    readiness: {
      checkedAt: "2026-10-24T12:00:00.000Z",
      signing: { status: "verified", detail: "Local signature recovered the configured issuer." },
      monad: { status: "connected", chainId: 10143, blockNumber: 28749163, detail: "Read a finalized Monad testnet block." },
      ai: { status: "configured", detail: "A key is configured; no model call performed." },
      recording: { paused: false, remaining: 7, detail: "Seven transactions remain in the approved allowance." },
    },
  };
}
