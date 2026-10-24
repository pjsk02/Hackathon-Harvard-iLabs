# Proposal for Aman / P1 and Jay / P2: each attempt's own Monad record

**Status: proposed, not approved or implemented.** Rachel requested a handoff
proposal before changes to teammates' files or the frozen shared contract.
No live sends are authorized by this document. Keep
`MONAD_MAX_TRANSACTIONS=0`; do not restore `MOCK_CHAIN`.

## Message to send to Aman and Jay

> The current Monad links prove the original/amended permission, not the agent's
> individual requests. Can we agree an optional `Receipt.attemptEvidence` field
> with pending/recorded/failed status and an attempt-specific fingerprint and
> verified anchor? Keep `Receipt.explorerUrl` as the checked permission's link.
> Aman would own recording and finalized readback; Jay would connect each
> bouncer decision to that recording; Rachel would handle guarded state updates
> and the evidence display. Please confirm the contract and retry policy below,
> and flag any unmerged work before anyone edits your files. Implementation
> starts with offline tests. Live sends need separate, bounded approval.

## 1. Current facts and scope

- [Team asks](TEAM_ASKS_LIVE_AI_AND_MONAD.md) request an additive attempt field.
  [P1 integration review](P1_INTEGRATION_REVIEW.md) distinguishes permission
  recording from attempt recording and flags missing original-request context.
- P1's `server/chain/ledger.ts` records a 32-byte value, verifies finalized
  readback, serializes writes and retains uncertain signed transactions.
  It does not currently expose an attempt-specific service.
- `server/gateway/gateway.ts` returns `Receipt.explorerUrl` from the checked
  permission. That field must retain its meaning, including for disputes.
- `client/src/split/ChainColumn.tsx` correctly labels attempts as application
  records. Do not change that claim before real attempt evidence exists.

Target every **action receipt**: allowed and blocked requests, each individual
tool call in a multi-call agent response, and explicitly labeled forced requests.
A dispute receipt remains a permission review, not an agent attempt. Recording
reviews separately would need another agreement and another send allowance.
Pre-receipt validation failures remain explicit API errors, not invented records.

This does not replace the existing permission-signing, live-agent or P3 screen
work. It defines their attempt-recording integration boundary.

## 2. Proposed additive shared contract — team approval required

Keep every existing field and response envelope. Add only the optional
`attemptEvidence` field to `Receipt`, plus its types. Absence means **no
attempt-specific evidence supplied**, not pending or recorded.

```ts
// Proposal only. Do not copy into shared/contract.ts before team agreement.
type AttemptRecord = {
  version: 1;
  attemptId: string; // server-generated random UUID, stable across its retries
  receiptId: string;
  chainId: 10143;
  permissionFingerprint: string; // fingerprint of the permission actually checked
  requestBlock: {
    blockNumber: number;
    blockHash: string;
    blockTimestamp: number;
  };
  agent: "atlas-research-agent" | "other";
  action: "read_regional_margins" | "read_employee_salaries" | "other";
  source: "agent" | "forced";
  decision: "ALLOWED" | "BLOCKED";
  checks: { id: CheckId; pass: boolean }[]; // exact five-check order
};

type AttemptEvidence = {
  record: AttemptRecord; // safe verification input, not the full receipt
  fingerprint: string;   // 32-byte commitment to the versioned record
} & (
  | { status: "pending"; anchor: null; txHash: string | null; detail: string }
  | { status: "recorded"; anchor: Anchor; txHash: string }
  | { status: "failed"; anchor: null; txHash: string | null; detail: string }
);

// Additive field on Receipt:
// attemptEvidence?: AttemptEvidence;
```

`pending` covers queued work and unknown submission/finality. A known signed
transaction identifier alone is not proof of broadcast, mining or success.
`recorded` requires successful finalized readback; its `txHash` must equal
`anchor.txHash`. `failed` means known not sent (paused, exhausted allowance,
pre-submission failure) or definitively failed on-chain. An RPC timeout after a
possible broadcast stays pending, never a definitive failure.

The decision and recording status are separate. Proposed policy: recording
failure does not rewrite a completed bouncer decision or pretend allowed data
was withheld. All five authorization checks must still pass before data access;
recording success can never turn a blocked request into an allowed one.
**P1/P2 must explicitly confirm this policy before implementation.**

## 3. Fingerprint, verification and privacy

- Generate a fresh attempt UUID for every new tool call, even if its action,
  decision and timestamp repeat. Allocate and retain it before asynchronous
  work. Reconciliation of that same call keeps the same UUID and fingerprint.
  Resettable receipt IDs and second-resolution timestamps are not unique enough.
- Agree one canonical encoding and test vectors before implementation:
  `keccak256(UTF8(JSON.stringify(tuple)))`, where `tuple` is exactly:

  ```text
  ["envoi.attempt.v1", version, attemptId, receiptId, chainId,
   permissionFingerprint, requestBlock.blockNumber, requestBlock.blockHash,
   requestBlock.blockTimestamp, agent, action, source, decision,
   [["signed", pass], ["agent", pass], ["valid", pass],
    ["stamped", pass], ["scope", pass]]]
  ```

  Normalize hexadecimal strings to lowercase, validate integers/booleans and
  allowlisted enum values, and reject missing/reordered checks. No arbitrary
  object serialization. Return the safe `record` so a verifier can recompute
  the fingerprint and compare it to the transaction input.
- Construct the record by explicit allowlisting, never by spreading a receipt
  or serializing a request body. Arbitrary agent/action strings become `other`.
  No report text, upload names, tool arguments, returned rows, salaries, margins,
  transcript, free-form check details or credentials belong in the record.
  Do not commit hashes of those protected payloads either.
- Publish **only the 32-byte fingerprint** in the data field of a zero-value
  issuer-to-itself transaction on chain 10143. No smart contract or new database.
- Before `recorded`, verify finalized/canonical evidence, expected issuer as both
  sender and recipient, zero value, successful status and exact fingerprint.
  Build the explorer URL from that attempt's verified transaction identifier.
  A well-formed URL or a permission anchor is not sufficient.
- This proves the issuer committed the supplied safe record. It does not prove
  the truth of a report, the model's reasoning or independently audited execution.

## 4. Ownership and execution sequence

| Owner | Proposed work, after approval |
| --- | --- |
| Team | Approve the additive contract, encoding, status meanings and recording-failure policy. |
| Aman / P1 | Add an attempt-recording/readback service under `server/chain/`, exported through its index. Reuse the real ledger's queue and shared spending allowance; do not create a second signer, nonce queue or budget. Distinguish definite failure from uncertain submission with structured outcomes rather than matching error text. |
| Jay / P2 | Connect `server/gateway/gateway.ts` to the service for each action receipt. Retain original request context and deterministic five-check results. Agent and forced paths must use the same implementation. Coordinate any route-level retry identity. |
| Rachel / P3 | Add generation-guarded evidence updates in `server/state.ts`; wire the approved fields into `client/src/split/ChainColumn.tsx` and its evidence helpers. Keep current light-theme layout and plain wording. |

1. Capture the reset generation and attempt UUID before the first await. Retain
   an immutable snapshot of the original slip and the finalized request block.
   Adopt P1's `OriginalRequestContext`/block-order interface with Jay; do not
   infer order from equal timestamps or from the later attempt-recording block.
2. Evaluate the five checks against that original request. A failed permission
   lookup stays fail-closed. If a trustworthy request block cannot be obtained,
   return an explicit error without data; do not invent chain time.
3. Recheck the generation before protected data access and state writes.
   Only `server/gateway/gateway.ts` may import `server/data/`. Keep blocked
   receipt data null. Store one receipt with pending evidence and freeze the
   safe record/fingerprint; later status changes must not change that record.
4. Request anchoring through P1's shared ledger with a bounded operation
   deadline. Check the captured generation again at the queued work's send
   boundary so work reset while waiting cannot start a new broadcast.
5. Update that existing receipt to recorded/failed, or retain pending if the
   outcome is uncertain. The initial POST can wait for a bounded result.
   An evidence update must neither add another receipt nor increment the counter.
6. Return the current receipt and refetch `/api/state`. Keep reads side-effect
   free, with no boot-time network requests, polling loop or websocket.

### Reset and retry agreement

- Cache/in-flight keys include the captured reset generation and attempt UUID.
  Check both the original HTTP generation and explicit operation generation
  when updating state. Reject stale completion/cached returns with 409.
- Reset clears the display/session, not Monad. An already broadcast transaction
  can finalize, but must never populate or satisfy a later session's receipt.
  Keep the ledger's unresolved nonce/signed-byte tracking across an in-process
  reset; clearing UI state is not permission to reuse its nonce.
- Rechecking an existing attempt must not re-evaluate access, call a data
  function again, create a new attempt ID or spend a new allowance slot.
  An ambiguous HTTP retry must not silently become a fresh tool call.
- Proposed manual recheck: `POST /api/attempts/:attemptId/reconcile`, returning
  the existing receipt after **read-only chain lookup**. P1/P2/P3 must agree
  route ownership and generation/operation identity before adding it.
  The UI then refetches state. Unknown or old-session IDs fail explicitly.
- Separate read-only reconciliation from `ledger.anchor()`: the current anchor
  path may rebroadcast pending signed bytes. Zero allowance must prohibit
  broadcast, including retries; a status check must not accidentally send.
- For this feature, propose **no automatic new send after a confirmed mined
  failure**. A deliberately new agent attempt gets a new UUID and consumes a
  new approved slot. Any explicit rebroadcast policy must preserve exact signed
  bytes and be separately agreed; an unresolved old nonce can block later work.
- In-memory state is not durable across process restart. Do not promise recovery
  after restart or automatically recreate/replay lost operations. Preserve any
  known transaction identifiers for manual readback; a restart is not evidence
  that earlier chain work was cancelled.

## 5. P3 display contract

| Evidence | Attempt row |
| --- | --- |
| Field absent | “Application record · Not recorded on Monad”; no attempt explorer link. |
| Pending | “Recording pending”; explain queued/unconfirmed status without claiming success. No confirmed-record link. |
| Recorded and verified | “Recorded on Monad · block …”; link only to this attempt's anchor. |
| Failed | “Recording failed” with the safe reason; keep the access decision visible. |
| Invalid/inconsistent evidence | “Record could not be verified”; no success label or link. |

The summary counts confirmed permission records and confirmed attempt records
separately. Permission review rows must not acquire an attempt link from
`Receipt.explorerUrl`. Do not present a guessed within-second order or the
attempt's recording time as the time authorization was checked. No elapsed-time
bracket, mock result or simulated AI outcome.

## 6. Offline acceptance first

Test with injected transports and controlled fixtures only in tests; never make
those fixtures available as a demo mode. No live RPC/LLM calls or signing routes
are needed for this gate.

| Case | Required result |
| --- | --- |
| Two otherwise identical calls, including same-second calls | Different UUIDs, fingerprints and attempt records. |
| Reconcile/retry one uncertain call | Same record, fingerprint and signed transaction; no duplicate receipt/data read/send. |
| Multi-tool model response and forced path | One independent attempt record per action receipt; source labels remain accurate. |
| Allowed / blocked / permission RPC failure | Deterministic checks unchanged; no protected data on any failed authorization. |
| Attempt write paused, failed or unknown | Truthful failed/pending status, never a fabricated recorded result or rewritten access decision. |
| Zero/exhausted allowance, including queued/retry paths | No unauthorized signing/broadcast; read-only reconciliation remains read-only. |
| Exact readback and hostile/mismatched evidence | Wrong issuer/recipient/value/input/chain, failed status, nonfinal/inconsistent block or permission-link substitution cannot yield recorded. |
| Serialization/privacy | Golden vector recomputes; changes to safe fields change the commitment; protected/free-form fields cannot enter encoding or transaction data. |
| Reset during checks, queue wait, broadcast and readback | No stale data access/state update/cache reuse; already broadcast work is never described as erased. |
| Reused receipt ID after reset and process-restart handling | No old attempt attached to a new receipt; no automatic replay on restart. |
| UI statuses, reload/recheck and legacy receipts | Correct pending/recorded/failed/absent labels; only genuine per-attempt links; no automatic retry of an unknown action. |

Run the existing offline suite, typecheck, build and isolated browser checks
alongside the new tests. A passing offline gate is **not** a live-chain pass.

## 7. Separately approved bounded live verification

Do not run this section until the code is agreed/implemented, the offline gate
passes, the funded issuer is configured through Secrets, and Rachel/P1 approve
the exact send ceiling. Do not read or share credential values.

Proposed budget for approval: **at most three new transactions in one controlled
process** — one original permission, one allowed action record and one blocked
action record. Use explicit forced requests for this narrow chain/bouncer check;
label them honestly. This verifies actual chain behavior, not live Claude
behavior, which remains covered by the separate agent integration work.

- Approve the process-local allowance and gas ceiling, prevent concurrent demo
  writes, and count permission and attempt sends against the same budget.
  Do not restart the process to replenish its allowance.
- Check each attempt's safe record/fingerprint against finalized transaction
  input, issuer, recipient, zero value, status and block evidence. Open both
  distinct genuine explorer links; do not substitute the permission link.
- Confirm allowed data is returned only after all checks pass, blocked data is
  null, and neither transaction contains report/data payloads.
- Stop new sends on an unexpected result or uncertain submission. Reconcile by
  read-only lookup; no extra smoke/self-test/dispute or automatic new attempt.
- Restore the zero allowance after the bounded run. Record public transaction
  links and observed results only; report any missing verification plainly.
  Additional live-agent requests require a separately approved bounded run.

## 8. Approval checklist to return

- [ ] Aman: flag pending branch work; approve chain service, structured outcomes,
      zero-allowance retry behavior and shared-budget use.
- [ ] Jay: flag pending branch work; approve per-tool-call integration,
      original-request/block-order handling and retry identity.
- [ ] All three: approve or amend the exact types/encoding, recording-failure
      policy, and manual read-only recheck route above.
- [ ] Rachel/P1, **later and separately**: approve issuer setup and the exact
      bounded live allowance after offline tests pass.

Until the first three agreements are received, leave teammates' implementation
and `shared/contract.ts` unchanged. The last checkbox is not implied by any code
approval. This proposal alone does not complete attempt recording or the demo.
