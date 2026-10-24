# P1 Monad chain module

P1 replaces the signing and live-ledger stubs without editing Jay's gateway or Rachel's UI/shared contract.

## Run checks

```sh
npm run typecheck
node --import tsx --test server/chain/chain.test.ts
node --import tsx server/chain/smoke.ts
```

Tests generate an ephemeral unfunded wallet inside the test process. They neither persist private keys nor broadcast transactions. The HTTP integration test uses genuine signatures on an explicitly selected mock ledger.

The default smoke check is read-only and requires no wallet: it verifies the public RPC chain ID and reads a finalized block.

For a real signing/anchoring/readback test, configure a **funded test-only** `ISSUER_PRIVATE_KEY` through Replit Secrets, then explicitly run:

```sh
node --import tsx server/chain/smoke.ts --anchor
```

That command spends test MON on one zero-value self-transaction. Only the fingerprint is submitted; no protected dataset goes on chain. `MONAD_RPC_URL` is optional; the public testnet endpoint and fallback endpoints are built in. Every endpoint used is checked against chain ID 10143.

Select the app mode explicitly with `MOCK_CHAIN=0` for real Monad or `MOCK_CHAIN=1` for offline integration. There is no automatic fallback to mock mode or server time. No network or wallet access occurs at module import.

## Compatible interface

Existing consumers can continue importing `anchor`, `lookup`, `latestTimestamp`, and `issuerAddressOrNull` through `server/chain/index.ts`.

- `anchor` returns the existing shared Anchor shape only after successful finalized readback.
- `lookup` returns extra canonical block and transaction evidence. Unknown/unfinalized transactions return null; inconsistent evidence and RPC outages throw.
- `latestTimestamp` now derives from the finalized chain reference, not the server clock.
- All sends use one queue and an eight-second operation budget including queue time. A timed-out broadcast retains its signed bytes and known transaction hash for reconciliation in the same process.
- Repeating an anchor for the same digest in the same process returns its existing verified anchor.

A process restart loses the in-memory queue/cache/pending transaction journal. This is not durable transaction recovery. Do not use the demo issuer concurrently in other processes or a wallet UI; the nonce queue coordinates this process only.

## Jay / P2 handoff: block ordering is not integrated yet

New additive exports:

- `latestReference()` returns `{chainId, blockNumber, blockHash, blockTimestamp}` from an observed finalized block.
- `stampMatchesRequest(slip, lookupEvidence, originalRequestBlock)` validates signature/digest/trusted issuer, successful finalized self-transaction and block ordering.
- `digestOf(mandate)` recomputes the exact EIP-712 typed-data digest.

Capture the original request reference once, retain it with the actual agent/action/resource/scenario context, and reuse it in disputes. Pass evidence obtained from the ledger, not unverified request-supplied block fields. The matching helper assumes its reference and evidence came from the verified ledger on the same canonical chain.

**The current gateway still compares timestamps.** P1 has not edited it or the frozen receipt contract. The same-second regression test proves the new helper, not the unchanged gateway. Coordinate the interface amendment before presenting the end-to-end flow as block-order protected.

The dispute route currently uses a bounded next-second wait only for compatibility with the legacy evaluator. Remove that workaround once P2 adopts retained request-block context. The route always uses the blocked action's original time/agent, preserves expiry, and fetches no protected data.

## Rachel / P3 handoff

- Agree request-reference/evidence fields in the shared types with both builders.
- An issuance operation begun in an empty session needs a session-generation token from state to detect reset-in-flight reliably. P1 currently guards concurrent slip/dispute calls and detects a replaced original receipt during disputes, but cannot detect every empty-session reset without that token.
- The UI can start without a wallet key; issuer health is null until configured. Signing must fail explicitly until credentials are supplied.
- Workspace and published deployments need their own verified configuration.

## Evidence limits

No on-chain receipt commitments, proof export, database or auth are added. The server-maintained request history is still mutable and lost on restart/reset. Agent IDs remain demo identifiers, not authenticated identity. The server holds the issuer key for the demo.

Correct narration: permissions must be **recorded before the request**. The chain does not prove when a document was first written or signed. A genuine amendment recorded later cannot retroactively authorize a request.
