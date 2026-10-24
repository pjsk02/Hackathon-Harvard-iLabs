# P1 integration handoff

Prepared for Aman Upadhyay, Jay (P2), and Rachel (P3).

## P1 scope delivered

- Genuine issuer signatures, canonical permission fingerprints, finalized Monad anchoring/readback.
- Explicit live transaction count and gas-price guards; default live allowance is zero.
- Conservative uncertain-write reconciliation: keep the same signed bytes and never skip a nonce because a later retry was rejected.
- Retained original/amendment operations across HTTP retries; repeat requests return the same signature, stamp and dispute receipt.
- Private permission/request snapshots; one original and one amendment per session rather than overwriting historical meaning on every click.
- Scope-only salary-block selection, preserved expiry, independently verified amendment evidence, no protected-data fetch in dispute.
- One absolute P1 route deadline propagated through nested chain calls.
- Compatible existing request/response JSON. No changes to the client, gateway, agent, protected data, shared contract, or shared state.

## What has NOT been integrated

These are explicit dependencies, not completed protections:

1. The current gateway still compares timestamps. The helper and P1 context adapter do not fix `/api/act` by themselves.
2. The current shared state lacks a generation token. P1 detects ordinary resets after completion and changed object references, but cannot detect every empty-session reset in flight without the P3 hook.
3. The current agent uses canned proposals. Forced-request verification establishes enforcement, not live LLM behavior.
4. Upstream UI changes and upload support were inspected, not merged into this P1 branch.
5. Server-maintained request history is mutable and lost on reset/restart; there are no on-chain receipt commitments or independently provable request timestamps.

## Proposed internal interface: agree together before merging

Public Receipt/Slip JSON remains unchanged. Add to P3's state module:

```ts
getGeneration(): number
getRequestContext(receiptId: string): OriginalRequestContext | undefined
```

`OriginalRequestContext` is exported from `server/chain/evidence.ts`:

```ts
{
  generation: number;
  originalSlip: Slip;
  requestBlock: {
    chainId: number;
    blockNumber: number;
    blockHash: string;
    blockTimestamp: number;
  };
  agentId: string;
  action: string;
  resource: string;
  scenarioId: string;
}
```

The P1 service automatically consumes those optional state exports when present. If the context hook exists but a request's evidence is missing/mismatched, it fails closed. Tests inject the proposed interface; that is not evidence the existing state module already implements it.

### Rachel / P3

- Increment generation monotonically on every Reset, including when state is already empty; do not reset generation to zero alongside receipt numbering.
- Retain a deep snapshot of request context keyed by generation and receipt ID. Clearing UI state cannot clear the ledger's unresolved transaction or replenish its spending budget.
- Provide generation-checked state writes and prevent old browser refresh results from repainting a new session.
- Keep fixed public mandate/action IDs; use internal generation/request identity for history.
- Preserve new stage UI work and clear mock-mode badges. For block-order mode, use verified check results rather than strictly greater timestamp seconds to label a late amendment.
- Treat a verification outage as unavailable evidence, not automatically “permission added after request.”

### Jay / P2

- Capture generation before the model await, not only when each tool starts.
- Capture one `latestReference()` at request acceptance and derive action time from that block.
- Bind expected resource/scenario from server configuration, not browser claims; deep-copy the original permission into request context.
- Retain that context with the resulting receipt through the agreed P3 state hook.
- Extend the existing evaluator's fifth argument to accept `OriginalRequestContext`; P1 passes it when available. Use the original block during dispute replay, never a freshly fetched request boundary.
- Use `stampMatchesRequest` with evidence looked up by the candidate stamp's transaction hash. Compare block numbers, including equal-timestamp blocks.
- Check generation again before protected-data access and before publishing the receipt. Wrap the action pipeline with `withChainDeadline` if applying a whole-action budget.
- Keep all five checks ordered. The P1 dispute records success only when signed/agent/valid/scope pass, stamped fails for genuinely late evidence, and no data is returned.

## Shared acceptance gates

1. An allowed request has five passing checks and approved data.
2. A forbidden request fails scope only and never invokes salary data access.
3. A genuine broader amendment fails stamped only against the original block, even within the same second.
4. Reset during issuance, an agent run, a gateway action and browser refresh cannot publish old state or execute against a new session.
5. HTTP retries reuse the same original/amendment and do not add transactions or dispute receipts.
6. Wrong resource/scenario, missing evidence, pending/failed transactions and RPC outages never release protected data.

## Verification and operational notes

- Offline checks: `npm run typecheck`, `npm run build`, and `node --import tsx --test server/chain/*.test.ts`.
- Real verification requires explicit authorization and `MOCK_CHAIN=0`, a funded test-only issuer, and a nonzero `MONAD_MAX_TRANSACTIONS`.
- Never use browser `?mock=1` as real-chain evidence. Health alone cannot prove the model or full flow is live.
- The count guard is per process, not a durable global allowance. Keep sends paused during development restarts; account for the whole approved verification session, including standalone scripts.
- One issuer must have only one active sending process. Do not restart an unresolved broadcast or use the same issuer concurrently from another workspace/wallet.
- A single anchor uses 30,000 gas. The 200-gwei ceiling caps it at 0.006 test MON. Reset does not replenish the process allowance.
- No secrets or raw signed transactions belong in Git, handoff docs, agent prompts, or logs.
- Production settings and their secrets must be checked separately by Rachel; workspace success is not production success.
