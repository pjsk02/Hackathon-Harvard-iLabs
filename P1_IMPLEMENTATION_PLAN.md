# P1 implementation plan and team implications

**Author:** Aman Upadhyay

**Status:** Proposed amendments for team review; not implemented or approved by publication

**Baseline:** [ENVOI_BUILD_SPEC.md](ENVOI_BUILD_SPEC.md)

**Related:** [Team alignment](alignment.md), [red-team review](Envoi%20Red-Team%20Review.md)

## 1. Purpose and ownership

This document translates the red-team findings into an ordered P1 plan and identifies the changes required from Jay and Rachel. It does not replace or silently amend the build spec. Shared interfaces and expanded scope need agreement from all three builders before implementation.

| Builder | Area | Responsibility |
| --- | --- | --- |
| Aman / P1 | Chain and slips | Signing, digest computation, chain evidence, reliable anchoring, original and amended permission routes |
| Jay / P2 | Bouncer and agent | Actual request context, deterministic checks, protected-data isolation, tool execution, agent evaluation and selftest |
| Rachel / P3 | Product and scaffold | Shared types with team agreement, state, UI, evidence presentation, deployment and demo narration |

The existing TypeScript/Express/React/ethers-v6 architecture stays. P1 should first prove its modules in the scratch project and coordinate integration with the main scaffold. Nobody should implement teammate-owned modules without coordinating with that owner.

## 2. Differences from the build spec

| Area | Build spec | Proposed correction | Consequence |
| --- | --- | --- | --- |
| Event ordering, sections 4-5 | Compare anchor timestamp with action time | Capture a finalized request block and compare canonical block ordering | Requires ledger evidence, request-context and receipt changes |
| Evaluation interface, section 5 | `evaluate(slip, action, actionTime)` | `evaluate(candidateSlip, originalRequestContext)` | Jay updates the gateway; all three agree shared context |
| Digest verification | Compare the stamp payload with the permission digest | Independently recompute the candidate EIP-712 digest and bind signature and stamp to it | P1 exposes a digest helper; Jay must not trust a supplied `slip.digest` |
| Resource/scenario binding | Scope explicitly checks allowed action | Also check expected resource and scenario from trusted server configuration | Extend the existing scope check without adding display rows |
| Clock failure, section 4 | Fall back to server time | Return an explicit verification error and release no data | Availability is reduced during outages; verification remains meaningful |
| Finality and cache, section 4 | One confirmation; cache mined results | Confirm finality, cross-check evidence, cache only finalized results | Additional reads/waiting; do not assume `wait(1)` establishes finality |
| Receipt integrity, section 2 | On-chain receipts excluded; receipts held in memory | Optional canonical receipt commitments with retained/exportable evidence | Explicit scope expansion; requires all three builders' approval |
| Dispute, section 4 | Replay blocked action/time against the amendment | Preserve the complete original context and link the dispute to the original action receipt | Additional historical linkage; never re-time the original request |
| Amended expiry | Amendment is otherwise the same as the original | Explicitly preserve original `expiresAt` | Clarifies intended behavior and prevents accidental expiry |
| Original issuance time | No explicit requirement to derive `issuedAt` from chain time | Use chain-derived issuance time | Avoids depending on the server clock for validity |
| RPC timeout, sections 4 and 10 | Eight seconds per call plus one retry | Bound attempts under an end-to-end operation deadline and reconcile uncertain writes | A timeout cannot be treated as proof a transaction was not sent |
| Agent prompt, section 6 | Tell the model to follow document instructions | Neutral assistant prompt with report content treated as untrusted | Jay changes the prescribed prompt; attack success is not guaranteed |
| Agent output, section 6 | One model turn, no summarization turn | Keep one turn but describe it as a tool-request/enforcement demo | No second turn is required unless completed recommendations are promised |
| Integration schedule, section 9 | Later hardening and forced selftest gates | Bring real-chain and live-model checks on the published URL forward | Team coordination; forced selftest does not verify the LLM integration |
| Narration, section 11 | Backdated permission rejected using a late stamp | Say “recorded too late,” not “proven created or signed late” | Rachel updates the explanation; the dispute scene remains |

### What does not change

- Monad testnet, chain ID `10143`, ethers v6.
- EIP-712 domain `Envoi`, version `1`, and the nine Mandate fields in their existing order.
- Zero-value self-transactions containing permission fingerprints; no smart contract.
- One server process, in-memory application state, no database or authentication.
- Five checks in order: signed, agent, valid, stamped, scope.
- Allowed margins, blocked salaries, the clearly labeled Force request fallback, and the amended-permission dispute.
- The LLM proposes; deterministic gateway code decides; protected data is read only after a full pass.
- Dispute evaluation never fetches protected data.

## 3. Correct evidence model

### Permission recording is not permission creation

The stamp establishes that a fingerprint was recorded by a particular block. It does not establish when the document was first written or signed.

The product rule should be: **Only permissions already recorded at the captured request boundary can authorize that request.**

The amended permission has a genuine Northwind signature. Do not describe it as a forgery by the consulting firm, or describe a leak when the demonstrated salary request was blocked. The server-held client key is an explicit demo trust assumption.

### Block ordering replaces timestamp ordering

Several Monad blocks can share the same second-granularity timestamp. A permission stamped in a later block can therefore pass the spec's timestamp-only comparison.

Capture an already-observed finalized block when handling the request. For verified evidence on the same canonical chain, require:

```text
permissionAnchor.blockNumber <= originalRequest.requestBlock.blockNumber
```

Retain and validate the block hashes. Use the captured block timestamp for permission validity windows; use block ordering for stamp eligibility. Capture this reference once and reuse it during disputes.

An off-chain request has no transaction index. Use transaction indexes only to order two actual on-chain transactions in the same block. Waiting for the clock to advance to the next second is not a substitute for this rule.

### Receipt commitments are a separate decision

Taking a timestamp from Monad does not protect an in-memory receipt from later changes. Without receipt commitments, describe the system as **chain-backed permission checks with a server-maintained request history**, not an independently tamper-evident request history.

If the team approves the extension:

1. Define a versioned, domain-separated deterministic receipt encoding, using fixed ABI fields or an agreed canonical-JSON scheme.
2. Bind a unique request ID, actual request context, captured request block, exact original permission digest, decision and check outcomes.
3. Exclude protected data, secret values and the commitment's own anchor metadata. A hash is not encryption; consider a high-entropy salt if metadata guessing matters.
4. Anchor the fingerprint through the P1 queue, confirm finality and read it back.
5. Retain/export the exact receipt envelope, salt if used, and verification evidence. A fingerprint alone cannot reconstruct a lost receipt; in-memory retention does not survive reset or restart.
6. Verify the original blocked receipt's commitment before replaying its dispute. Preserve its original request boundary, not the later receipt-commitment time.

This detects modification relative to the selected commitment. It does not independently prove truthful server reporting, complete logging, absence of competing receipts, or actual data withholding.

If claiming evidence for every Allowed request, agree whether the receipt must be finalized before releasing data. Do not release data and then present a failed commitment as a successfully proved operation.

## 4. Shared interface amendment to agree

These are proposed shapes, not changes already applied to `shared/contract.ts`.

### Chain reference

`chainId`, `blockNumber`, `blockHash`, `blockTimestamp`, captured through finalized-block evidence.

Extend ledger lookup evidence with block hash and finality information, and add a finalized-block-reference read. A compatibility `latestTimestamp()` helper may derive its value from that reference but must not silently fall back to server time.

### Original request context

Unique `requestId`, actual `agentId`, original `mandateId`, independently recomputed original `mandateDigest`, requested `action`, expected `resource`, expected `scenarioId`, and captured `requestBlock`.

Expected resource/scenario values must be bound to trusted route/scenario configuration, not simply copied from caller claims. A caller-supplied agent name is a demo identifier, not authenticated identity.

### Evaluator and receipts

Use the conceptual interface `evaluate(candidateSlip, originalRequestContext)`. The candidate in a dispute intentionally differs from the original permission, so do not reject it solely because its ID/digest differs.

Keep existing UI receipt fields. Add the agreed original context or evidence reference; dispute evidence should identify `originalReceiptId` and the candidate `evaluatedSlipDigest`. If approved, receipt commitments also need distinct pending/committed/error state and their own evidence reference.

Recover the candidate signature against the configured issuer, require its declared issuer to match, and match the on-chain payload to the independently recomputed candidate digest. Validate transaction success and canonical evidence. Keep all five displayed checks; resource/scenario enforcement can live in scope.

## 5. Ordered P1 implementation plan

| Step | Aman / P1 work | Exit condition / handoff |
| --- | --- | --- |
| 1 | Agree interface, ordering, finality, outage behavior and evidence-scope corrections with Jay and Rachel | One agreed contract; no unilateral shared-type changes |
| 2 | Set up the P1 scratch harness with ethers v6 and a funded test-only issuer through the secrets flow | On-demand chain ID and finalized-read checks work; no network calls at server boot |
| 3 | Deliver a deterministic mock with controllable blocks, equal timestamps, hashes, finality and failures | Jay and Rachel can build and test without live RPC; no silent live-to-mock fallback |
| 4 | Implement strict Mandate validation, signing, digest computation and signer recovery | Exact field/domain tests pass; mutation of any signed field invalidates the original authorization |
| 5 | Implement finalized block reads and consistent transaction/receipt/block lookup | Missing, pending, failed or inconsistent evidence never authorizes access |
| 6 | Implement queued zero-value self-transactions and uncertain-broadcast reconciliation | Concurrent operations cannot reuse nonces or accidentally duplicate a logical write |
| 7 | Implement original slip issuance with chain-derived time, signing, anchoring and readback | Store/return a successful slip only after verified evidence |
| 8 | Integrate request boundaries and digest verification with Jay's gateway | Earlier stamps qualify; later same-second stamps fail; context is preserved |
| 9 | Implement dispute assembly and checks-only evaluation | Genuine broader amendment is Rejected with only stamped failing and `data: null` |
| 10 | If approved, add canonical receipt commitments and verification | Saved receipt mutation is detected; original request time is not replaced |
| 11 | Run published real-chain, live-model, forced selftest and reset/repeat tests with teammates | Actual demo URL works and each scene's elapsed time is recorded |
| 12 | Freeze evidence, links, known limitations and accurate demo narration | Team can explain exactly what is and is not proved |

### Dispute details that must not be lost

- Select a matching action-kind Blocked receipt and retrieve its original permission/context; return the specified 409 if no suitable blocked action exists.
- Start from the original permission, add the originally blocked action, use the amended ID and a fresh nonce.
- Claim Monday 09:00 in `America/New_York`, converted correctly to Unix seconds.
- Preserve the original expiry. Recalculating Monday plus five days can make the amendment expired during Saturday's demo.
- Sign with the genuine issuer key and anchor now.
- Evaluate against the frozen original request boundary, never a newly captured action time.
- Return all five checks and no data; compute the result from checks, not a hardcoded outcome.

### Operational details

Serialize sends and retain transaction identity through timeouts. Reconcile a known transaction or rebroadcast the same signed bytes rather than blindly signing another transaction after an uncertain broadcast.

Cache only finalized evidence. Do not use a fixed sleep as proof of finality. Set a shared end-to-end deadline including queue waits, retries and confirmation work. The eight-second scene target is a measured UX target, not a guaranteed RPC service level; show honest pending/error states if it cannot be met. Coordinate repeated clicks and reset-during-flight behavior with Rachel so an old operation cannot populate a reset session.

## 6. Implications for Jay / P2

| Required coordination | Jay's change | Dependency / implication |
| --- | --- | --- |
| Request capture | Capture the actual request context and finalized reference once | Agree fields with Aman and Rachel before wiring routes |
| Five checks | Recompute candidate digest, enforce trusted issuer, agent, validity, canonical stamp ordering, action/resource/scenario | Use P1 helpers; preserve all five rows and order |
| Dispute evaluation | Accept original context while evaluating a different candidate permission | Never fetch data and never capture a replacement request time |
| Error handling | Distinguish verification outage from an ordinary policy rejection | No data on error; coordinate error/pending rendering with Rachel |
| Agent prompt | Treat report content as untrusted; do not instruct the model to obey injected document instructions | Injection success may fall; use honestly labeled Force fallback |
| Agent output | Keep one turn and accurately label what it demonstrates | A second model turn is separate scope if recommendations are promised |
| Tests | Add actual live-model tool-call smoke testing beyond forced selftest | Forced selftest alone cannot verify provider/model integration |
| Optional receipt extension | Build deterministic receipt envelopes before committing them through P1 | Finalize encoding, release policy and mutation tests together |

Protected data remains reachable only through the gateway. Neither the LLM nor dispute code gains a direct protected-data import.

## 7. Implications for Rachel / P3

| Required coordination | Rachel's change | Dependency / implication |
| --- | --- | --- |
| Shared contract | Coordinate additive context/evidence fields with both builders | Update consumers together; the old frozen shapes cannot be changed unilaterally |
| State | Retain the original request snapshot and link dispute to original receipt/candidate | Reset/restart still lose memory unless evidence is retained elsewhere |
| UI | Distinguish verified success, pending verification and operational errors | A failed RPC is not evidence a policy was successfully checked |
| Timeline and copy | Describe recorded-before-request policy; separate on-chain stamps from server-maintained receipts | Do not imply the chain proves creation date, authenticated agent identity or truthful execution |
| Deployment | Bring signing/anchor/readback and real-model smoke tests forward | Verify deployment secrets; repeat after reset on the actual demo URL |
| Optional receipt extension | Provide retained/exportable proof envelopes and commitment status | Downloaded demo evidence avoids a database but is not durable shared storage |
| Demo | Keep Force request explicitly labeled; explain genuine Northwind amendment recorded too late | Do not claim an AI attack succeeded when the forced path was used |

No new database, auth system or smart contract is proposed. Optional receipt evidence adds transactions, retention work and latency; it is not a free UI-only change.

## 8. Acceptance tests

- Sign/recover returns the configured issuer; declared issuer, signature, recomputed digest and finalized stamp agree.
- Changing any signed field invalidates the original authorization; substituting only `slip.digest` cannot bypass verification.
- An earlier anchor block with the same timestamp qualifies; a later anchor block with that timestamp fails.
- Wrong agent fails agent; wrong expected resource/scenario fails scope; none causes a protected-data call.
- Margins pass all five checks; salaries fail scope only; the intended amended dispute fails stamped only and returns no data.
- Expired/future permissions, missing/failed/pending stamps, inconsistent hashes, wrong network and RPC outages never release data.
- Concurrent sends and timeout-after-broadcast cases do not reuse nonces or create accidental duplicate logical writes.
- Reset while an operation is in flight does not attach stale completion to the new session.
- The amended Monday date retains original expiry and correct New York timezone handling.
- If commitments are approved, mutation of action, agent, decision, permission digest, request boundary or salt invalidates the retained proof; missing evidence is unverifiable.
- Published URL: real signing/anchor/readback, actual live-model tool call, forced selftest, reset and complete repeat; measure each scene against the eight-second target.

## 9. Decisions before implementation

1. Approve finalized block ordering and explicit original request context.
2. Approve independent digest verification and expected resource/scenario enforcement.
3. Approve failure-closed verification without server-clock fallback.
4. Decide whether to approve the receipt-commitment extension. If not, narrow the public-record claim explicitly.
5. Agree shared fields, retention/release policy if applicable, rollout order and accurate stage wording.

Recommended priority: complete correctness fixes first; approve small receipt commitments if independent dispute-history evidence remains a core promise. Cut stretch scenarios or extra model turns before compromising the core verification rules.

## References

- [Monad block states and finality](https://docs.monad.xyz/monad-arch/consensus/block-states)
- [Monad timestamp precision and timing](https://docs.monad.xyz/developer-essentials/summary)
- [Replit secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
