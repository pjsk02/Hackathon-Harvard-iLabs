# P1 two-hour implementation plan

**Prepared for:** Aman Upadhyay (P1)

**Status:** Revised after three independent adversarial reviews. Planning only; no implementation or real transaction authorized by this document.

**Execution update:** Subsequent P1 implementation and the separately approved real-chain tests are documented in `P1_TEAM_HANDOFF.md` and `P1_LIVE_VERIFICATION.md`. The evidence inventory below is the pre-implementation baseline, not the latest test status.

**Baseline:** Existing P1 branch, not a greenfield build. Jay owns P2; Rachel owns P3. Follow the original build spec except for explicitly agreed security amendments. Do not edit teammate-owned files without their agreement or explicit authorization.

## 1. Target and scope

**Commitment:** a bounded P1 hardening and handoff milestone, not a guarantee of complete product readiness within two hours.

**Conditional integrated target:** original permission signing and finalized anchoring, forced allowed/blocked requests through the real gateway, a genuine broader amendment rejected against the original request boundary, and reset/repeat. This requires delivered P2/P3 changes AND fresh permission to run app-generated testnet transactions. Without either, explicitly deliver P1 module/offline readiness and leave integrated acceptance incomplete.

This is a demo with trusted server execution and mutable in-memory request history, not a production security service or independently verifiable request ledger.

Keep one scenario, one server, one dedicated test issuer, ethers v6, genuine EIP-712 signatures and Monad testnet. Do not add smart contracts, databases, login, wallet UI, revocation, new scenarios, receipt commitments or a second model turn. Live-model implementation remains Jay's parallel work; forced requests test P1 enforcement but do not substitute for proof of a live LLM interaction.

Do not migrate workspaces during the core implementation unless the user chooses that first. If moving first, push/transfer the current P1 branch and context, reconfigure secrets securely, verify the destination and then begin the execution budget. Do not transmit private keys through code, Git, agent prompts or chat.

## 2. Evidence inventory

- Implemented: typed-data signing/recovery, digest recomputation, finalized RPC reads, queued anchoring, a block-order verification helper, explicit mock ledger and original/dispute routes.
- Prior checks: typecheck, build and 14 tests passed; these test signatures and a fake RPC/mock HTTP flow, not a real application broadcast.
- Configuration checked: issuer secret exists, real-chain mode is configured, health derives the issuer address and the public Monad RPC returned a finalized testnet block.
- User reports funding/testing the wallet separately. That is not evidence this app's anchor/retry/dispute path is correct.
- Unverified: real app broadcast/readback, live end-to-end dispute, production configuration, timing and live LLM behavior.
- Incomplete: gateway still compares timestamps, shared receipts omit original block context, selftest is 501, agent proposals are canned, and empty-session reset cannot be reliably detected by P1 alone.
- Upstream has newer stage UI/scenario labels and a browser-only mock option. Fetch/review changes, preserve the existing endpoint/action identifiers, coordinate a controlled integration; do not overwrite teammate work.
- P1 code is on a local branch; transferring/importing only remote main would omit it.

## 3. Feasibility assumptions

Two hours is a conditional estimate, not a guarantee. It assumes the existing scaffold is retained, one workspace is selected before implementation, the test wallet has sufficient test MON, the real RPC remains usable, and Jay/Rachel can land the narrow shared changes promptly or authorize a coordinated patch. A permission to edit another owner's code is not extra engineering capacity: if P1 must implement all cross-owner work alone, reduce the promised outcome rather than keeping the same integrated commitment.

If shared changes cannot land, only P1 module readiness is feasible; do not present the unchanged gateway as block-order protected. If application-level real writes remain deferred, the result is implementation plus offline verification, not a completed Monad acceptance test.

## 4. Work sequence and timeboxes

| Window | Work and ownership | Required exit evidence |
| --- | --- | --- |
| 0-10 min | Lock workspace, transaction permission and named owner commitments. Pin the source revisions and agree internal identities, context, reset generation and error semantics. Jay/Rachel start agreed work in parallel now, not when P1 reaches integration. | Each dependency has an owner and delivery time; no receipt commitments added. Missing agreement immediately selects P1-only scope. |
| 10-20 min | If authorized, verify one real original-signature/anchor/readback using the existing flow with a strict transaction cap. Otherwise use the slot to reproduce route retry/reissue failures offline. | Real issuance evidence OR explicitly offline-only evidence. Stop investigating live configuration after this slot; do not consume the entire build window. |
| 20-45 min | P1: retain logical issuance/dispute operations and signed payloads across HTTP retries. Use session-scoped identities and snapshots; add a small reset-independent unique-transaction budget. | Duplicate HTTP calls/lost responses do not create a new permission; repeated signing requests cannot indefinitely spend test MON. |
| 45-65 min | P1: bounded uncertain-write handling and complete-route deadlines. Preserve exact raw transaction identity, sanitized failure classes and unresolved status. | Proven rejection is distinguishable from unknown delivery; uncertainty cannot trigger a new nonce/permission. If automatic recovery cannot be established safely, fail-stop with the known transaction reference and document this incomplete acceptance item. |
| 65-80 min | Integrate only the agreed context/generation interfaces that owners have delivered, or finish P1 adapters and handoff if unavailable. Preserve fixed public identifiers and upstream UI work. | Gateway-level block-order and reset protections if integrated; otherwise no claim that those end-to-end findings are fixed. Freeze feature work at minute 80. |
| 80-105 min | Targeted regressions, typecheck/build and, only if authorized/integrated, a first real forced core sequence. Measure whole-route latency. | Prioritize retry identity, same-second ordering, reset during issue/action, original snapshot retention, uncertain write/no-data behavior. A second real reset/repeat run is a goal only if the first passes with time remaining. |
| 105-120 min | Buffer for blockers, collect verified evidence, prepare the P1 handoff and accurate narration. No new capabilities. | A precise implemented/tested/unverified checklist; real transaction links only when actually obtained. Do not promise two real runs, a live LLM or production readiness by elapsed time alone. |

The table is an execution estimate, not a promise to extend a fixed deadline. If “next two hours” includes this review or a workspace move, subtract that elapsed time from the remaining work. A migration is a separately measured prerequisite; do not hide it outside a hard cutoff.

## 5. Minimum interface agreement

### Request boundary

Capture a single finalized chain reference when accepting an action: chain ID, block number, block hash, block timestamp. Derive validity time from that reference; do not trust browser-supplied time or replace the reference during dispute replay.

Store an internal original request context: generation-scoped unique request identity, actual agent/action, expected server-configured resource/scenario, original permission ID/digest/snapshot, request block, and session generation. Prefer a separate internal state map keyed by generation plus receipt ID to minimize UI/schema churn; agree its ownership with Rachel. Do not put protected response data in this context.

Keep the existing public Mandate IDs and action constants for client/agent compatibility. They are display/routing identifiers, not unique historical evidence keys. Reusing `northwind-atlas-001` or resetting `r_001` must not replace the snapshot used to evaluate a historical request.

### Candidate evaluation

Evaluate the candidate permission against that original context. Require the configured issuer, independently recomputed candidate digest, successful finalized self-transaction and correct network. Require candidate anchor block <= captured request block on the same canonical chain. A different amendment ID/digest is expected and must not fail merely for being different.

Keep signed/agent/valid/stamped/scope in their original order. Scope binds action plus expected resource/scenario. A verification outage prevents data access and is not presented as a successfully established policy result.

### Retry and reset identity

Allocate a logical operation before signing. For the one-scenario demo, prefer one original issuance per session/scenario and one amendment per original blocked receipt; repeated identical POSTs resume those operations. Reset deliberately begins a new session. If separate reissuance is required, agree an explicit new-operation boundary rather than treating a retry as reissuance.

Retain the mandate/signature/digest/known transaction across retries. Reset increments a monotonic generation; do not recycle it with receipt numbering. Capture it at issuance/dispute/action entry and before the model await at agent-run entry, propagate it through tool execution, and validate it before protected-data access and state publication. Guard browser refresh responses too so an old fetch cannot repaint a new session.

Reset cannot cancel a transaction already broadcast. A known pending transaction still needs reconciliation even if its session has ended; do not reuse its nonce or attach its completion to the new UI session.

### Failure classes and funded-endpoint limits

Keep provider credentials/raw error bodies out of logs and UI, while retaining safe internal failure classes. Only classify a broadcast as definitely rejected if the observed evidence rules out acceptance across all attempts. Once any attempt has an ambiguous result, keep the exact transaction unresolved; a later rejection does not prove it was never submitted.

Do not silently bump fees, skip nonces, reset the wallet or discard an uncertain transaction. Conservative fail-stop/manual investigation is acceptable for a limited demo but does not satisfy automatic rejection-recovery acceptance. Pending state remains in-memory; no restart-safe recovery is promised.

Add a small unique-broadcast budget that Reset cannot clear, plus idempotent operation reuse. Re-sending identical signed bytes is not a new logical transaction. Use a minimally funded dedicated test wallet and one sending process. This limits public test-gas drain without introducing a login feature; it is not production abuse protection.

## 6. Acceptance matrix

| Case | Expected |
| --- | --- |
| Real original issuance | Genuine issuer signature; payload equals recomputed digest; successful finalized self-transaction on 10143; verified readback. |
| Allowed action | Five checks pass and only approved data is returned. |
| Forbidden action | Scope fails, data null, protected salary function not invoked. |
| Genuine late amendment | Original request boundary retained, original expiry preserved, signature/agent/valid/scope pass, stamped fails, Rejected with no data. |
| Same-second later block | Actual gateway/dispute rejects it; testing only an unused helper is insufficient. |
| Alter signed field/digest | Original authorization fails; cached/supplied digest cannot grant access. |
| Wrong signer/agent/resource/scenario | Appropriate check or explicit validation failure; no data call. |
| Unknown/pending/failed/mismatched stamp or RPC outage | No data release; explicit non-success, not fabricated evidence or server-clock fallback. |
| Duplicate click/HTTP retry/lost broadcast reply | Same logical operation or explicit in-progress response; no fresh permission created merely to retry. |
| Deterministic broadcast rejection | Safe explicit error; cannot permanently poison the sender queue without a recovery path. |
| Reset during issue/dispute/action | Old session cannot populate new state; a broadcast transaction remains independently observable. |
| Reissue original slip before dispute | Historical request retains the original permission snapshot; no silent evidence substitution by reused ID. |
| Repeat run | Reset and rerun core scenes twice; verify real mode in server AND browser, not just health. |
| Timing | Measure complete route and UI duration; account for initial reads, waits, retries, finality, gateway lookup and rendering. |
| Pre-reset model completion | Cannot act against a new post-reset permission or publish stale receipts. |
| Browser stale refresh | Cannot repaint the new session with old asynchronous state. |
| Public signing abuse | Reset does not replenish a process-wide test-gas/send budget; repeated POSTs reuse operations instead of unlimited new broadcasts. |

This is a prioritized acceptance inventory, not a claim that the full matrix fits one 25-minute test slot. Mark each item tested, untested, failed or intentionally deferred at handoff; deferred safety behavior must reduce exposed functionality or the completion claim.

## 7. Gates and fallback rules

- At 10 minutes, if owner/interface agreement is unavailable: deliver P1-only hardening and handoff; do not change teammates' files or claim full integration.
- At 20 minutes, if a permitted real stamp cannot be read back: record the blocking cause and select offline P1 hardening. No mock outcome counts as a real-chain pass.
- At 65 minutes, if the gateway still cannot retain request context: do not claim the block-order red-team finding is fixed. Keep a clearly labeled limited demo only with the user's agreement.
- By 80 minutes, freeze new capabilities and reserve the remainder for verification/blockers/handoff. No receipt evidence system, alternate scenario or deployment migration.
- If the live model refuses the injection or is unavailable, the labeled Force request can demonstrate enforcement; disclose it is forced.
- If the late-permission dispute fails, an edited-permission signature failure is only a different, explicitly labeled fallback scene; it does not prove timing or complete the original dispute acceptance test.
- Never downgrade real-chain failure to mock or local chain silently. Eight seconds remains the measured scene target, not a promise achieved by resetting a fresh timeout for each nested call.

## 8. Reviewer panel

Completed one read-only round with three independent reviewers:

1. **Security/correctness:** conditional go for a trusted single-process demo; no-go for claiming current gateway block-order protection or independently provable request history.
2. **Delivery feasibility:** no-go for an unconditional integrated two-hour promise; conditional go for bounded P1 hardening with early owner/authorization gates.
3. **Integration/operations:** conditional go for P1-only progress; integrated/live/production completion is blocked on actual owner delivery and real verification.

The reviewers are independent model-backed agents, not a guarantee of distinct model vendors. The revised plan adopts their common narrowing and preserves disagreement: the delivery reviewer judged the initial full schedule overcommitted. See `P1_COUNCIL_REVIEW.md` for findings, evidence and dispositions. No reviewer result substitutes for running acceptance tests.

### Evidence checklist for the integrated gate

- Browser URL has no `?mock=1`; network calls reach the expected real API.
- Server health says `mockChain:false`; the selected environment's issuer and chain ID are correct.
- Agent proposals are verified live separately, or clearly labeled forced/scripted. Neither absence of a badge nor health proves a live LLM.
- Successful real slip links have verified readback, not fabricated explorer URLs.
- Dispute wording comes from the actual failed check. An RPC outage is not narrated as proof of late recording.
- If block-order integration permits equal timestamps, the UI does not infer “late” solely from strictly greater seconds.
- Workspace checks are not described as published/deployment checks; deployment setup remains Rachel-owned.

### Minimal teammate handoff

**Jay:** capture original context at gateway entry; adopt the block-order helper; enforce server-configured resource/scenario; propagate the run generation from before the model await to before data/publication; retain five check rows and distinguish verification failures. Live-model and selftest implementation are separate work, not P1 deliverables.

**Rachel:** monotonic generation and guarded state publication/context retention; stale browser refresh protection; preserve endpoint/action IDs when integrating newer labels; distinguish browser/server mock modes; correct generic rejection/late-stamp labels. These are real dependency changes, not merely approval of a plan.

**P1:** retained issuance/dispute operation identity, bounded transaction recovery, exact signed payload reuse, private-key-safe errors and tests; consume delivered shared interfaces without silently editing teammate areas.

## 9. Decisions to bring to the user after review

- Build/validate in the current workspace first, or finish the workspace move before starting the two-hour execution window?
- Will Jay/Rachel land the narrow shared changes alongside P1, or may P1 make a specifically coordinated patch to their interfaces/state?
- May a small, bounded set of real testnet transactions be run at the early verification gate, or must all real application tests remain deferred?

Default recommendation: no on-chain receipts in this two-hour window. If independent request-history proof is mandatory, re-scope the deadline and retention/release behavior rather than quietly claiming the existing design provides it.

## Relevant code and references

- `server/chain/ledger.ts`, `rpc.ts`, `slip.ts`, `evidence.ts`, `chain.test.ts`, `smoke.ts`, `README.md`
- `server/routes/slips.ts`
- `server/gateway/checks.ts`, `server/gateway/gateway.ts`
- `server/state.ts`, `shared/contract.ts`
- `server/agent/agent.ts`, `server/routes/selftest.ts`
- `ENVOI_BUILD_SPEC.md`, `P1_IMPLEMENTATION_PLAN.md`
- Upstream: `docs/DEMO_HANDOFF.md`, `docs/P3_BUILD_PLAN.md`, `shared/scenarios.ts` and browser mock routing
