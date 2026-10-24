# Envoi — running context and chronological decision record

**Maintainer:** Aman Upadhyay  
**Recorded:** 2026-10-24  
**Canonical repository:** https://github.com/pjsk02/Hackathon-Harvard-iLabs  
**Purpose:** Preserve the decisions, their reasons, ownership, evidence, and outstanding integration work so teammates can continue without reconstructing the conversation.

This chronology is reconstructed from the project conversation, repository history, and handoff documents. Exact times appear only where recorded evidence supplies them. Untimed sections are in conversation order, not invented wall-clock order.

This file contains no credentials. Secret names are documentation, not secret values. A source-code push is not a deployment or a successful live acceptance test.

## Current position — read this first

- Aman owns P1, Jay owns P2, and Rachel owns P3. Aman subsequently authorized coordinated P1/P2/P3 integration in this workspace.
- The product is an AI tool-request enforcement demonstration backed by real Monad testnet records. It is not a production authorization service or an independently verified account of AI reasoning.
- The local integration contains P1 request-context protection, separate attempt commitments, real Claude integration, recovery controls, verified readiness checks, and the final explorer-link presentation.
- Rachel's product names, shared-session protections, upload parsing, and presentation persistence have been provisionally combined with that local work.
- **No new main push has been performed for this integration.** The user requested a conflict review and team action before the push proceeds.
- GitHub main advanced during preparation: Jay's P2 commit `f368b61` is now included in `origin/main` at `c300351`, along with Windows/local-development fixes. The local candidate still needs reconciliation with that newest main.
- The earlier local merge exposed 16 overlapping files. Their text has been provisionally combined, but Git still marks their index entries unmerged; this is not a finished or committed integration.
- Current runtime: real-chain mode, local signing verified, Monad finalized-block connectivity verified, and **live recording paused with zero available sends**.
- The original five-transaction approval was fully spent. A later approval permits **at most three additional Monad transactions plus one Claude proposal-only call**, after teammate integration. That new allowance remains unused.
- Local code for optional `.env` loading also exists on the older P1 branch. The latest main now supplies its own cross-platform startup/environment solution; reconcile these deliberately rather than adding two loaders.

## 1. Import instructions first; do not assume authorization to build

**Decision:** Import the existing instructions and wait for the user's commands before implementing.

**Why:** The initial selection said to build Envoi, but the accompanying instruction explicitly narrowed the immediate task to importing instructions.

**Implication:** Imported teammate context does not determine the current operator's identity, edit permissions, available integrations, or branch policy.

## 2. Establish the team and baseline

**Decision:** Aman works on P1; Jay works on P2; Rachel works on P3. An earlier reference to “Prishan” was corrected by the user to Rachel.

| Area | Initial owner | Scope |
| --- | --- | --- |
| P1 | Aman | Permission signing, fingerprints, Monad evidence, original/amended permission routes |
| P2 | Jay | Deterministic checks, protected-data access, agent/tool execution, evaluation and self-test |
| P3 | Rachel | State/scaffold, interface, attachments, product copy, presentation and deployment coordination |

**Decision:** Compare the uploaded build spec and red-team material with the canonical GitHub build spec before changing the plan.

**Why:** A proposed correction must not be presented as something already required, agreed, or implemented.

**Sources:** [Build spec](ENVOI_BUILD_SPEC.md), [red-team review](Envoi%20Red-Team%20Review.md), [alignment](alignment.md), [original P1 plan](P1_IMPLEMENTATION_PLAN.md).

## 3. Publish the proposed P1 changes and teammate implications

**Decision:** Create a separate working branch before implementation. Publish a Markdown proposal on main under Aman's name, not the Replit Agent name.

**Why:** Jay and Rachel needed an explicit list of shared changes and consequences before cross-owner implementation.

**Proposal:** [P1_IMPLEMENTATION_PLAN.md](P1_IMPLEMENTATION_PLAN.md).

The proposed corrections included:

1. Compare canonical block order, not only timestamps.
2. Recompute the signed permission fingerprint independently.
3. Bind action, resource, scenario, configured issuer, and original request context.
4. Fail explicitly during verification outages rather than substituting server time.
5. Verify finality and the actual transaction/receipt/block evidence.
6. Preserve the original request boundary and expiry when reviewing an amendment.
7. Separate HTTP retry identity from transaction retry identity.
8. Treat on-chain request commitments as an additional scope decision.
9. Describe “recorded too late,” not “proven created or signed too late.”

These were proposals at publication time, not evidence of a completed implementation.

## 4. Keep the core architecture; build on Monad

**Decision:** Use Monad testnet, chain ID **10143**, ethers v6, and the existing Envoi EIP-712 domain and nine signed fields.

**Decision:** Record 32-byte fingerprints through zero-value issuer-to-self transactions. Do not add a smart contract.

**Decision:** Keep one Express process, a React/Vite client, and in-memory state. Do not introduce a database, authentication platform, WebSockets, or a new application architecture for the hackathon.

**Security rule:** The model only proposes tools. Deterministic server code decides access, and only the gateway imports protected data.

**Implication:** A supplied agent name is a demonstration identifier, not authenticated identity. The trusted server and RPC provider remain explicit trust assumptions.

## 5. Set up the issuer privately; separate configuration from proof

**Decision:** Keep the issuer key in server-side secrets. Never put its value in source code, example files, Git, screenshots, chat, or handoff notes.

**Decision:** Use a dedicated, minimally funded test wallet and bounded real writes.

**Decision:** Configure workspace and deployment credentials separately and verify the actual target environment; Git does not transport a secret vault.

**Why:** An address, funded wallet, or successful manual transaction does not establish that this application signs, sends, verifies finality, and reads the correct record.

The user added the issuer key and reported having tested the address and made test transactions. Application-generated verification remained a separate gate.

## 6. Move workspaces before beginning the bounded implementation

**Decision:** The user chose to continue in the new workspace and stated that the migration had already occurred.

**Implication:** Work could begin there, but source transfer did not establish that credentials, integrations, or production settings had migrated. Verify those independently without exposing values.

**Decision:** Avoid unrelated workspace migration or tool-configuration work during the P1 implementation window.

## 7. Review the two-hour plan adversarially

**Decision:** Run three independent model-backed reviews of correctness, feasibility, and integration risk before committing to the implementation.

**Result:** Conditional go for P1 hardening; no unconditional promise of a complete integrated product in two hours.

**Important limit:** This was not a formal security audit or a guaranteed council of different model vendors.

**Plan changes after review:**

- Secure owner commitments and real-test authorization early.
- Retain exact original permission snapshots and generation-scoped operation identities.
- Make retries idempotent at the HTTP layer as well as the ledger layer.
- Propagate reset protection through model calls, verification, data access, publication, and browser state.
- Keep uncertain signed transactions identifiable instead of silently replacing them.
- Use fail-stop/manual reconciliation where safe automatic recovery cannot be established.
- Reserve time for evidence and handoff rather than expanding scope indefinitely.

**Sources:** [Council review](docs/P1_COUNCIL_REVIEW.md), [two-hour plan](docs/P1_TWO_HOUR_PLAN.md).

## 8. Approve and complete the first bounded real verification

**Decision:** The user approved at most **five** real Monad transactions.

**Implementation:** P1 added genuine EIP-712 signing/recovery, finalized readback, nonce serialization, retained issuance/amendment identity, bounded uncertainty handling, transaction caps, and original-permission snapshots.

**Recorded result:** Completed around **2026-10-24 15:35 UTC / 11:35 AM New York**. All five authorized transactions were used: one original-permission smoke check, then two original/amended permission pairs.

**Evidence:** [P1 live verification](docs/P1_LIVE_VERIFICATION.md) contains the five actual public transaction links and observed timings.

**What that pass established:** Genuine signatures and permission records, forced allow/block decisions, genuine amended-permission rejection in the tested legacy-compatible flow, retry reuse, and reset between completed runs.

**What it did not establish:** A live Claude run, the later integrated gateway's same-second context behavior, durable request history, deployment acceptance, or the later attempt-recording feature.

**Safety decision:** The five-write authorization is spent. A restart, reset, or workspace change never renews it.

## 9. Retain truthful evidence wording and original request history

**Decision:** A permission transaction is not a separate public record of each access attempt.

**Decision:** Keep `Receipt.explorerUrl` referring to the permission record. Never reuse that link as if it proved the attempt itself was recorded.

**Decision:** Preserve the original action's permission snapshot and finalized request block for disputes. A later, genuinely signed amendment is not a forgery; it is ineligible if recorded after the original boundary.

**Decision:** Use block numbers and matching canonical block evidence for ordering, including different blocks with the same timestamp.

**Reset boundary:** Reset invalidates application work but cannot cancel an already broadcast transaction or erase public records. It must not refill the approved spending allowance.

**Sources:** [P1 team handoff](docs/P1_TEAM_HANDOFF.md), [reset boundaries](.agents/memory/reset-boundaries.md).

## 10. Add safe local-development support without publishing credentials

**Decision:** Add `MONAD_MAX_TRANSACTIONS=0` to the safe example configuration.

**Decision:** Support an optional local `.env` without overriding existing environment variables; keep the real file ignored.

**Why:** Teammates needed local development, but sharing code must not share private keys. A checked-in example contains variable names and safe defaults only.

**Scope correction:** The user explicitly asked not to turn a simple `.env` request into unrelated work.

**Integration note:** Earlier P1 work implemented local loading separately. The newest main now includes a Windows-compatible launcher and optional `.env` loading with real-chain mode and zero sends by default. Preserve one coherent startup path; do not blindly layer both approaches.

## 11. Expand authorization from P1-only work to combined integration

**Decision:** After reviewing P2/P3 handoffs, the user explicitly authorized completing the P1/P2/P3 integration here.

**Why:** Shared gateway, state, and presentation changes were needed to make the original-context and evidence guarantees hold end to end.

**Implication:** Historical “P1 only” and imported P3 ownership restrictions describe earlier phases; they do not override this explicit coordinated-integration authorization.

**Decision:** Preserve teammate contributions and shared contracts; do not overwrite them with older stubs or wholesale branch copies.

## 12. Add separate request commitments with strict privacy limits

**Decision:** Add optional `Receipt.attemptEvidence`, retaining compatibility with receipts that have no attempt record.

**Decision:** Each attempt has a server-generated UUID and a versioned, domain-separated canonical commitment. It binds the permission fingerprint, original request block, bounded agent/action identity, source, access decision, and all five check booleans.

**Privacy decision:** Exclude reports, uploaded text, tool arguments, transcripts, returned rows, and arbitrary identifying fields. Do not hash protected payloads into the record as a substitute for encryption.

**Decision:** Permissions and attempts share the same signer, nonce queue, allowance, and reset fences.

**Decision:** Keep authorization and subsequent audit recording separate. An allowed access is not retroactively blocked because later recording failed; recording failure must remain visibly separate.

**Decision:** Require finalized, matching chain/sender/recipient/value/status/payload/block readback before displaying an attempt as recorded.

**Decision:** Pending attempts get manual read-only reconciliation. Do not poll, rebroadcast from the recheck route, create another receipt, refetch protected data, or increment the counter.

**Scope limit:** This proves what the application committed, not independently truthful AI reasoning, complete logging, or actual withholding against a malicious server.

**Sources:** [Attempt handoff](docs/ATTEMPT_RECORDING_HANDOFF.md), [integration handoff](docs/P1_P2_P3_INTEGRATION.md).

## 13. Connect a real Claude proposal path without faking success

**Decision:** Use one genuine Anthropic tool-proposal call, with the selected built-in report or extracted uploaded text.

**Decision:** Keep hidden-note text in the model's input while removing presentation markers. Protected tool-result rows are not sent to the model.

**Decision:** Execute at most three valid proposals; zero proposals stays zero. Unsupported tools/arguments and provider failures must not become a forced request or canned result.

**Prompt/response boundary:** The earlier plan recommended neutral treatment of document instructions. The current demonstration agent still uses document-following system instructions; do not describe prompt hardening as completed. The deterministic data gate remains the access-control boundary. This is one tool-proposal turn, not a second model turn producing a completed analysis from protected tool results.

**Decision:** Disable SDK retries in the local integration so a bounded check does not silently create additional model calls.

**Configuration:** Default `AGENT_MODEL=claude-haiku-4-5`, with managed/own-key selection supported where configured. The user added `ANTHROPIC_API_KEY` as a server secret.

**Clarification:** An Anthropic text/tool API key does not implement microphone input, transcription, or speech synthesis. Voice was mentioned in discussion, but audio capabilities were not built or verified by this work.

## 14. Add request identity and explicit self-test consent

**Decision:** New intentional `/api/act` and `/api/agent/run` operations use a UUID-v4 `Idempotency-Key`.

**Why:** Duplicate clicks, retries, and lost responses must not rerun the model, release data twice, or create another logical chain record.

**Decision:** Retain the identity of an uncertain action across browser reloads. Do not automatically repeat it, and reject altered-input reuse and keys from a previous reset generation.

**Decision:** `GET /api/selftest` only reports requirements and budget. Running a self-test requires explicit `POST`, an empty session, no unresolved nonce, and at least four approved unused transaction slots.

**Four writes:** Original permission, allowed attempt, blocked attempt, amended permission. The forced self-test does not call Claude.

**Implication:** The original build spec's GET self-test behavior is superseded in this integration; callers and UI must move together.

## 15. Preserve Rachel's product and shared-session work

**Decision:** Keep the chosen light porcelain/navy/lavender presentation, responsive layouts, keyboard support, reduced motion, and classic fallback.

**Presentation order:** Grant → Clean example → Prompt-injected example → Monad evidence.

**Decision:** Keep the shared-session identity and one-active-operation protections, stale-tab detection, guarded resets, request recovery, and session-scoped upload/progress persistence.

**Decision:** A disconnected browser is not proof that server work stopped.

**Product names:** Rachel's latest visible names are **Goldman Stanley** and **McBain**. Internal protocol identifiers and historical documents need not be globally renamed.

**Caution:** The single-session guard and in-memory request limiter are not authentication, a durable usage quota, or production abuse protection.

## 16. Approve the next live verification, with a priority fix first

**Decision:** The user approved **three new Monad transactions plus one Claude proposal-only call**, and asked to include Jay's and Rachel's newer work before using them.

**Intended transactions:** Original permission, one allowed attempt, one blocked attempt.

**Excluded:** A new dispute or the four-write self-test does not fit that three-write approval. The proposal-only Claude check must not dispatch tools and consume additional chain writes.

**Priority request:** Fix the screen saying signing and Monad were unverified before continuing.

**Current accounting:** No new approved transaction or model call has been spent. Sends remain paused during integration.

## 17. Replace configuration-only status with real, read-only readiness

**Finding:** The previous health endpoint returned configuration, while the UI always described signing/Monad as unverified. That message was not evidence of a stuck signing operation.

**Decision:** On demand, verify a local non-authorizing signature and read a verifiable finalized Monad block. Do not send a transaction or call Claude.

**Decision:** Report signing, Monad connectivity, AI credential configuration, and recording allowance separately. A paused or exhausted allowance is not a failed connection.

**Decision:** Missing/malformed readiness never implies verified success. An AI key's presence never implies a successful live model call.

**Recorded check:** On 2026-10-24, local signing passed and Monad returned finalized block **73,875,579**. Later reads also succeeded. These are read-only connectivity results, not new transaction evidence.

**Verification at that stage:** Typecheck, eight health-status unit checks, and three isolated browser checks passed.

## 18. Design the final public-evidence handoff

**Request:** Make the final product step link to the actual Monad explorer record. The supplied example transaction was a reference, not permission to hard-code that record.

**Decision:** Keep the evidence summary inside Envoi and open the verified explorer transaction in a new tab.

**Why:** Preserve the presenter's place and avoid depending on third-party iframe embedding.

**Implemented presentation:** Separate Request record and Permission record cards; latest access outcome and source; confirmed block; shortened transaction ID; prominent “View on Monad”; expandable technical details; original/amended permission distinction and the existing timeline.

**Safety decision:** Pending, absent, failed, or invalid evidence never gets a confirmed-attempt link. Never substitute a permission's transaction or an unrelated amendment for the request record.

**Verification at that stage:** Typecheck/build, nine targeted unit checks, and seven isolated browser checks passed. Desktop/mobile fixture screenshots were inspected. No live transaction or Claude call was used.

## 19. Request a main push and comprehensive running context

**Request:** Push all completed work to main under Aman's name and add a chronological decision record.

**Decision:** Use the canonical repository, preserve teammates' published history, avoid force-pushing, and consolidate only unpublished local integration checkpoints under the configured Aman identity.

**Preparation:** Preserve the original integration branch, create a local publication candidate from GitHub main, and combine the integration changes without importing unpublished Replit Agent checkpoint authors into the new main commit.

**Important:** Existing published team history is not rewritten to change authorship.

**Initial overlap:** Sixteen files conflicted while combining Rachel's main/P3 updates with the local integration. Provisional resolutions retained product/session protections alongside attempt evidence, readiness, idempotency, and the evidence presentation.

**Verification of that provisional candidate:** Typecheck, build, and **123 offline unit/API checks** passed. This did not include the newest Jay/Windows update.

## 20. Pause the push to review Jay's fixes and attachment behavior

**Latest request:** Include Jay's uploaded fixes; account for Rachel's ongoing UI changes; show both merge conflicts and functional code conflicts in simple language so the user can take action.

**Decision:** Pause publication. Do not silently select a winner, replace an owner's implementation, or claim the merge is complete.

**Fresh upstream finding:** Jay's P2 changes are now on main, not merely waiting on his branch. Main advanced to `c300351`; the P2 commit is `f368b61`.

### Conflict review

| Area | What differs | Consequence if combined carelessly | Coordinating owner |
| --- | --- | --- | --- |
| Original request evidence | The local integration propagates an immutable original context. Jay's compatibility evaluator explicitly refuses that additional context and keeps a separate finalized-reference path. | Disputes or checks can fail, or historical ordering can be weakened by dropping the context. | Aman + Jay |
| Agent call shape and uploaded text | The local route calls the proposer with a validated request object. Jay's proposer accepts a report ID plus optional report text. | A route can call the wrong function shape, rejecting or losing an uploaded report. | Jay, with Rachel validating the browser payload |
| Retry identity | Local action/run routes require and cache UUID keys. Jay's newer route implementation is a different execution path. | Taking a whole file from one side can remove duplicate-call protection or break existing tests/callers. | Aman + Jay |
| Self-test | The local test includes two additional attempt transactions and explicit four-write approval. The other implementation and tests target a different compatibility stage. | The test can report the wrong write cost, call an unexpected interface, or bypass the intended consent flow. | Aman + Jay; Rachel for the control |
| Shared session and readiness | Rachel's latest work guards stale tabs and active operations. Local readiness verifies signing/network and reports the zero allowance. | Keeping only one side can re-enable stale actions or display a misleading connection failure/success. | Rachel + Aman |
| Public-record UI | Older copy says attempts are not on Monad; local code supports separately validated attempt records. | Real attempt records can be hidden or permission links can be misrepresented as request proof. | Rachel + Aman |
| Scripts and local startup | Main now includes Windows/local `.env` support and P2 tests. The local candidate adds other tests and retains earlier scripts. | A package-file winner can break local startup or silently omit an owner's checks. | All three |

The original 16 overlapping paths, still awaiting final staging/approval:

- Product and transport: `client/src/Preflight.tsx`, `client/src/api.ts`, `client/src/classic/ClassicApp.tsx`, `client/src/request.ts`, `client/src/split/BainePane.tsx`, `client/src/split/ChainColumn.tsx`, `client/src/split/MorganPane.tsx`, `client/src/split/SplitApp.tsx`, `client/tests/ui-harness.ts`.
- Backend state and startup: `server/index.ts`, `server/routes/state.ts`, `server/state.ts`.
- Scripts: `package.json`.
- Collaboration/library metadata: `.agents/agent_assets_metadata.toml`, `.agents/memory/MEMORY.md`, `.agents/memory/envoi-git-remote.md`.

These original text conflicts were provisionally combined locally, not approved and published. The newer P2/main update adds further overlapping backend changes. A file compiling cleanly does not establish that the two versions agree about behavior.

### Attachment findings — what is verified and what is not

- The real current health check shows recording paused with **zero** remaining sends. The current screen also has no granted permission.
- Sending requires a permission, a usable recording allowance, no uncertain/active action, and a completed clean example before an uploaded injected example.
- Upload selection and sending are distinct. The current Upload control is available while Send is disabled by those prerequisites.
- Supported inputs are `.docx`, `.txt`, `.md`, `.html`, and `.htm`; not PDF or legacy `.doc`. Limits are 5,000,000 file bytes, 60,000 extracted characters, and a 255-character file name.
- Four isolated browser checks passed for Word/hidden-note extraction, unsupported/corrupt/oversized files, hidden HTML, and upload persistence across view changes/reload.
- These tests intercept the API. They do **not** establish that a live selected file reaches Claude on the newest merged P2 implementation.
- The displayed prerequisites explain the current disabled Send state. They do not rule out additional bugs in Rachel's work or the not-yet-reconciled integration.

### Remaining actions, not completed work

1. User/owners decide how the above overlaps should be resolved.
2. Reconcile the local candidate against the newest main, preserving P1 protections, Jay's fixes/tests, Rachel's UI/session work, and Windows startup support.
3. Stage actual resolutions, rerun the coherent offline/browser suite, and verify attachment-to-model transport using an isolated model.
4. Use the separately approved bounded live verification only after that integration; do not replenish budgets by restarting.
5. Update this record with actual results, commit under Aman's identity, push normally to main, and verify the remote commit.
6. Configure and verify publication separately if requested. Do not equate a GitHub push with a published working application.

## Cross-cutting limits that remain in force

- Application state, retry caches, pending recovery, and transaction counters are process-local. No durable replay, archive, or restart-safe recovery guarantee exists.
- Reset clears the application session; it does not erase public evidence or cancel an already broadcast transaction.
- A fingerprint commits selected content; it does not reconstruct a lost record, prove completeness, or independently validate AI reasoning.
- A forced request is not an AI proposal. A successful offline test is not a live pass. A configured key is not a verified provider call.
- Never add model calls, testnet transactions, production writes, secret exports, or force pushes just to finish a source-control task.

## How to continue this running context

Append new dated decisions in order, including: request/decision, reason, affected owners, implementation state, verification scope, and remaining work. Correct superseded claims explicitly rather than silently deleting the history. Keep actual secrets, raw signed transactions, private connection details, and provider error bodies out of this file.
