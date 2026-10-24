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
2. This P1 branch still has the older shared state. P3 has now supplied reset-generation guards on upstream `main`; integrate them and adapt P1 to the actual `getResetGeneration()` name rather than asking P3 to rebuild them. The combined implementation has not been tested here.
3. The current agent uses canned proposals. Forced-request verification establishes enforcement, not live LLM behavior.
4. Upstream UI changes and upload support were inspected, not merged into this P1 branch.
5. Server-maintained request history is mutable and lost on reset/restart; there are no on-chain receipt commitments or independently provable request timestamps.

## P3 reset interface now available upstream

Rachel deliberately restored temporary P1 stubs on `main` so Aman's verified implementation remains authoritative. Integrating the latest P3 work must preserve the P1 chain modules, not replace them with those stubs.

Public Receipt/Slip JSON remains unchanged. P3's actual state interface is:

```ts
getResetGeneration(): number
isCurrentGeneration(expected: number): boolean
assertCurrentGeneration(expected: number): void
withResetGeneration<T>(expected: number, work: () => T): T
addSlip(slip: Slip, expectedGeneration?: number): Slip
addReceipt(receipt: NewReceipt, expectedGeneration?: number): Receipt
```

P3 mounts request-generation middleware before the API routers. Its state writes reject stale request generations, including attempts to override an old request context with a fresh explicit token.

**P1 compatibility step still required:** `permission-service.ts` currently expects the proposed `getGeneration()` name. Adapt it to P3's actual interface, capture generation before the first await, include it in retained operation identity, and check it before returning a cached/reconciled result. Pass the captured generation explicitly for writes outside an API request. Do not rename P3's implementation just to match the earlier proposal.

## Original request evidence still needs agreement

The original block/permission snapshot is a separate requirement from reset generation. The following hook remains proposed; it is not supplied by the inspected P3 state implementation:

```ts
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

If the context hook exists but a request's evidence is missing/mismatched, P1 fails closed. Tests inject the originally proposed interfaces; they do not establish compatibility with the newly delivered P3 state implementation. Reconcile names and run offline integration tests before claiming the reset issue is closed.

### Rachel / P3

- Preserve the already-delivered monotonic reset generation and request-scoped state-write guards; P1/P2 should consume them.
- Retain a deep snapshot of request context keyed by generation and receipt ID. Clearing UI state cannot clear the ledger's unresolved transaction or replenish its spending budget.
- Verify the combined server and browser behavior so old refresh results cannot repaint a new session.
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

## Rachel's additional coordination notes

- P2 remains Jay's workstream. An offer from P3's agent to implement Claude is not a reassignment; coordinate explicitly before overlapping those files.
- The current P1 flow anchors original and amended permissions only. It does not record every allowed/blocked attempt on Monad, and this note does not expand that scope.
- Keep `Receipt.explorerUrl` pointing at the permission checked. If attempt anchoring is explicitly added, agree a separate optional field with all three owners, for example `anchor?: Anchor | null`. Only then should the dashed blocked-request marker link to its own transaction.
- Attempt anchoring would require a new transaction allowance and decisions about what evidence is committed and when; the initial five-transaction allowance is already consumed.
- Rachel requests no elapsed-time/bracket display for that extension. Block ordering remains a backend rule regardless of presentation.
- Rachel reports that the original Word report's instruction is visible black text on yellow highlighting; her alternative sample uses white 1pt text. Match the demo narration to the selected file. Those upload interactions were not verified in this P1 branch.
- Browser `?mock=1` is a labeled timing rehearsal, not evidence of live Monad or live Claude.
- Neither issuer secrets nor deployment secrets travel in Git. Configure and verify them separately in each target environment; do not copy them into code or documents.
- P3 removed `MOCK_CHAIN` from its development configuration. Do not restore mock mode to hide its expected “not built yet” error while P1 is still awaiting integration.

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
