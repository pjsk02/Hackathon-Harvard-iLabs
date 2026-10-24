# P1 Monad chain module

P1 replaces the signing and live-ledger stubs without editing Jay's gateway or Rachel's UI/shared contract.

## Run checks

```sh
npm run typecheck
node --import tsx --test server/chain/*.test.ts
node --import tsx server/chain/smoke.ts
```

Tests generate an ephemeral unfunded wallet inside the test process. They neither persist private keys nor broadcast transactions. The HTTP integration test uses genuine signatures on an explicitly selected mock ledger.

The default smoke check is read-only and requires no wallet: it verifies the public RPC chain ID and reads a finalized block.

For a real signing/anchoring/readback test, configure a **funded test-only** `ISSUER_PRIVATE_KEY` through Replit Secrets. Real sends are paused by default: an explicitly approved, nonnegative integer `MONAD_MAX_TRANSACTIONS` must be configured before running:

```sh
node --import tsx server/chain/smoke.ts --anchor
```

That command spends test MON on one zero-value self-transaction. Only the fingerprint is submitted; no protected dataset goes on chain. `MONAD_RPC_URL` is optional; the public testnet endpoint and fallback endpoints are built in. Every endpoint used is checked against chain ID 10143.

Select the app mode explicitly with `MOCK_CHAIN=0` for real Monad or `MOCK_CHAIN=1` for offline integration. There is no automatic fallback to mock mode or server time. No network or wallet access occurs at module import.

## Bounded real-transaction approval

- `MONAD_MAX_TRANSACTIONS` defaults to **0**, even when a funded issuer key exists and health says `mockChain:false`. Health/read-only RPC and mock tests continue working.
- The cap counts unique potentially submitted transactions. Retries of identical signed bytes and cached successful digests do not consume a second slot.
- A proven initial rejection or pre-submission failure releases the slot. A mined failure still consumed gas and retains its slot. An unknown outcome keeps both its slot and its original signed transaction.
- A later rejection cannot clear a transaction whose earlier attempt may have been accepted. No automatic nonce skipping, fee bumping, or replacement permission.
- The fixed 30,000-gas limit and maximum 200-gwei gas price cap each new anchor at **0.006 test MON**. Above that price, the app refuses to send.
- UI Reset cannot replenish this limit. This is a **per-process** demo guard, not a persistent accounting system: restarting the app or using the standalone smoke script starts another process budget. Do not do that to bypass the agreed total; count actual test transactions across the whole verification session.
- Never run multiple processes sending from the same issuer. If a transaction is unresolved, investigate its public hash before restarting or changing the sender.

The guard is not authentication and does not make this public demo safe for a valuable or mainnet-funded key. Use only a dedicated minimally funded testnet issuer.

## Compatible interface

Existing consumers can continue importing `anchor`, `lookup`, `latestTimestamp`, and `issuerAddressOrNull` through `server/chain/index.ts`.

- `anchor` returns the existing shared Anchor shape only after successful finalized readback.
- `lookup` returns extra canonical block and transaction evidence. Unknown/unfinalized transactions return null; inconsistent evidence and RPC outages throw.
- `latestTimestamp` now derives from the finalized chain reference, not the server clock.
- All sends use one queue and an eight-second operation budget including queue time. P1 HTTP operations now propagate one absolute deadline across their chain calls. A timed-out broadcast retains its signed bytes and known transaction hash for reconciliation in the same process.
- Repeating an anchor for the same digest in the same process returns its existing verified anchor.
- Safe RPC failure metadata distinguishes definitely rejected/not-submitted transactions from uncertain delivery. Raw provider errors and signed bytes are never returned.

A process restart loses the in-memory queue/cache/pending transaction journal. This is not durable transaction recovery. Do not use the demo issuer concurrently in other processes or a wallet UI; the nonce queue coordinates this process only.

## Retained HTTP operations

The permission service retains one original and one amendment per session. Identical `POST /api/slips` and `POST /api/dispute` calls resume the same signed payload/known stamp or return the previous result; they do not create new permission nonces or duplicate dispute receipts. Concurrent calls return a retryable 409. Reset after completed operations deliberately starts a new run.

The service keeps private signed snapshots, rejects changes to the published original or blocked receipt, and only selects a salary request blocked solely by scope. Original expiry, agent and resource survive amendment. Verification failure produces a safe error, not an ALLOWED or falsely justified REJECTED dispute. Both dispute state writes follow the last validation without an intervening await.

`withChainDeadline` propagates an absolute budget through nested calls, including the existing evaluator's ledger lookup. This bounds the P1 issue/dispute RPC pipeline, not browser animation time or the unchanged P2 `/api/act` pipeline. Pending signed operations survive timeouts for retry in the same process.

**Still outstanding:** reliable Reset during an initially empty session's first issuance requires Rachel's `getGeneration()` hook. Without it, P1 retains the legacy object-reference checks and detects ordinary completed-run resets, but cannot observe every empty-session reset. Tests with injected generation/context adapters verify the proposed integration, not the unchanged shared state/gateway.

## Jay / P2 handoff: block ordering is not integrated yet

New additive exports:

- `latestReference()` returns `{chainId, blockNumber, blockHash, blockTimestamp}` from an observed finalized block.
- `stampMatchesRequest(slip, lookupEvidence, originalRequestBlock)` validates signature/digest/trusted issuer, successful finalized self-transaction and block ordering.
- `digestOf(mandate)` recomputes the exact EIP-712 typed-data digest.
- `OriginalRequestContext` describes the proposed internal evidence handoff; it is not a change to public Receipt JSON.
- `withChainDeadline(deadline, operation)` shares a complete-operation deadline across chain calls.

Capture the original request reference once, retain it with the actual agent/action/resource/scenario context, and reuse it in disputes. Pass evidence obtained from the ledger, not unverified request-supplied block fields. The matching helper assumes its reference and evidence came from the verified ledger on the same canonical chain.

**The current gateway still compares timestamps.** P1 has not edited it or the frozen receipt contract. The same-second regression test proves the new helper, not the unchanged gateway. Coordinate the interface amendment before presenting the end-to-end flow as block-order protected.

The dispute route uses a bounded next-second wait only when retained request context is unavailable. When P3 supplies `getRequestContext`, the service passes that original context as the evaluator's fifth argument and uses block progression instead of the next-second workaround. P2 must consume that argument before this mode can pass end-to-end: a timestamp-only evaluator that accepts a same-second late stamp is rejected as an incomplete dispute, not recorded as ALLOWED. No protected data is fetched by the dispute service.

## Rachel / P3 handoff

- Agree request-reference/evidence fields in the shared types with both builders.
- Proposed internal state hooks are `getGeneration(): number`, incremented monotonically by Reset, and `getRequestContext(receiptId): OriginalRequestContext | undefined`. The existing state namespace is consumed directly; P1 automatically uses these exports once available. Agree this interface with Jay first.
- P1 checks generation after asynchronous work and before publishing state when that hook exists. Jay must independently carry the same generation through model calls and before protected-data access; Rachel must guard stale browser refreshes.
- The UI can start without a wallet key; issuer health is null until configured. Signing must fail explicitly until credentials are supplied.
- Workspace and published deployments need their own verified configuration.

## Evidence limits

No on-chain receipt commitments, proof export, database or auth are added. The server-maintained request history is still mutable and lost on restart/reset. Agent IDs remain demo identifiers, not authenticated identity. The server holds the issuer key for the demo.

Correct narration: permissions must be **recorded before the request**. The chain does not prove when a document was first written or signed. A genuine amendment recorded later cannot retroactively authorize a request.
