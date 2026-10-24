# P2 integration — current-main compatibility, with separate deferred extensions

The owner authorized continuing the existing P2 implementation against reviewed
`801dd452…`, without treating proposed context/storage/isolation APIs as approved.
This handoff completes that compatibility slice. Immutable-context replay and the
production isolated self-test are **separate, deferred work**, not claimed complete.

## Isolation and exact comparison base

| Item | Verified reference |
| --- | --- |
| Owner-reviewed source reference | `801dd452bd1b3ca1df5c634112191f50ac786161` |
| Current main / final integration base | `ab38b963d581b910e108d9964d3df2d25a6b2fa8` |
| Current remote P1 | `7c14d056ea61e3476f057c9ed65b5d034e80d0eb` |
| Remote P2 before source publication | `e06db4f0422b0ddf6d91960a3425b05d3a2af736` |
| Preserved local P2 checkpoint | `590aab422fc97f08fe69eeab08afed24c2c265d7` |
| Preserved earlier checkpoint | `48a492d43a392b89694622e559f8cdd1dc4c9277` |
| P2 checkpoint base | `e06db4f0422b0ddf6d91960a3425b05d3a2af736` |

The preserved `.local/p2-je` and earlier review directory no longer have their own
`.git` entries. Git there resolves to the parent. Neither was repaired or edited.
The earlier review source was checked against its 25-file package manifest.
A verified clone at `.local/p2-compat-review/candidate` retains the reviewed source
and its passing results. Main advanced during pre-publication verification; no
push happened then. A separate final clone at
`.local/p2-compat-review/current-main-candidate` uses verified metadata at
`.local/p2-compat-review/current-main-git`, no alternates, and branch `P2-Je`.
Its base is the current main above. Preserved P2 history is retained separately;
the accompanying bundle/manifest identify exact sources.
No shared checkout, branch or Git metadata was repaired, switched or staged.
Existing checkpoint packages, dirty source and prior review packages are preserved.

`5c5241c…` delivered P3 HTTP/session/presentation safeguards; `ab38b96…` added
handoff text only, with the same application tree. P1, P2, shared contracts and
the dependency lock did not change from the owner's reviewed reference. Their
interfaces were rechecked and this P2 candidate was revalidated on the newer base.
P3's new HTTP guards, upload parser and session identity are preserved, not edited.
Per current `docs/P3_INTEGRATION_HANDOFF.md`, **Aman now owns combined integration**.

Only P2 ownership paths were overlaid. The three preserved prerequisite files
`server/state.ts`, `server/routes/state.ts`, `server/index.ts` match Rachel's
`6899947967437df75bfc1cceb2572e40b3970b72` versions; they were **not** overlaid.
The candidate keeps their current-main versions and all current P1 modules.
No shared type, scenario, UI, configuration, package, lockfile, skill or memory
is part of the P2 diff. Neutral-agent, upload and reset work is preserved, not
replaced with another provider implementation.

## Delivered P2 work and explicit limits

- Normal actions capture **one** `latestReference()` before verification, clone
  caller values and the requested slip, and use block height/hash ordering.
  Timestamps supply validity/display only. Exact requested-slip, actual-caller,
  trusted-resource/scenario, issuer and independently rehashed payload checks remain.
- `createEvaluator()` now returns the internal
  `evaluateAtReference(slip, action, requestBlock, agentId?)` verifier. It consumes
  delivered P1 `ChainReference`, `lookup`, `stampMatchesRequest` and cryptographic
  helpers. This is **not** the unapproved persisted `OriginalRequestContext` API.
- Unknown/unfinalized, wrong-network, invalid-reference or inconsistent evidence
  is 503 with no data and no policy receipt. A lookup exception is likewise 503.
  A verified mismatching stamp fails `stamped`; only a genuinely verified candidate
  in a later block gets the detail `Stamped on Monad after this request`.
- `createGateway()` retains current-generation guards before protected reads,
  after awaits and before publication. Only `gateway.ts` imports protected data.
  Both forced/agent sources and the five check IDs/order are unchanged.
- **Normal receipts still use P3's existing `addReceipt`; the local reference is
  not persisted. This is not immutable-context replay integration.**
- The P1-facing `evaluate(slip, action, actionTime, agentId?, originalContext?)`
  preserves the **working four-argument, time-based compatibility path**. P1's
  existing service waits for the next integer second before its amendment.
  The candidate still gets genuine signature/digest and finalized-stamp checks.
  A supplied non-undefined fifth argument is rejected explicitly with 503 rather
  than treating a proposed context as agreed. No normal-action acquisition error
  falls back to this compatibility path. It does not protect same-second replay.
- The named `selftestRouter` and existing `GET /api/selftest` are preserved.
  Its mounted default returns 503 before reset, issuance, data or child HTTP.
  It has **no** singleton snapshot/restore, shared reset, loopback fetch or extra mount.
- The internal runner verifies signatures/digests, stamp readback callbacks,
  ordered checks, forced source, request/candidate identities, null denied data,
  retained dispute time, four structured margin rows and finite elapsed timings.
  Separate runner fixtures use actual P1 issuance but injected replay and sentinel
  data. The **current-main compatibility test additionally uses actual P1 issuance
  AND replay, P2 gateway/data, and P3 state/middleware** in a private Node process.
  Its two runs verify exact real fixture margins, all receipt fields/checks/null
  denial data, elapsed durations, retained-service reset behavior and unchanged
  parent state. Its chain is explicitly mock: not live or retained-context evidence.
- A bounded router test seam holds its single-flight lock until the underlying
  child/factory **and cleanup** settle, even after an HTTP timeout. This is tested
  separately from owner delivery; a factory parameter or flag is not proof of isolation.

## Exact route and error semantics

| Entry point | Current candidate behavior |
| --- | --- |
| `GET /api/selftest`, existing mount | 503 `{error:"Self-test is unavailable: an approved isolated state adapter has not been integrated; the shared demo will not be reset."}` |
| `runSelftest(client, evidence?, signal?)` | Internal only; exact `{pass,steps:[{scene,expected,got,ms}]}`; stop on the first failed scene |
| `createSelftestRouter({createIsolatedSession,maximumMs})` | Internal injection seam only; no client-selected mode/factory; default has no factory |
| Internal runner success | Four scenes; no extra JSON fields; evidence in first scene and `X-Envoi-Selftest-Mode` |
| Internal verification failure | 200 with `pass:false`, safe stage-specific cause; no raw provider error |
| Busy run / stale isolated session | 409 `{error}` |
| Missing isolation / preparation or cleanup failure | 503 `{error}` |
| Overall deadline | 504 `{error}`; lock remains until pending work settles |
| `POST /api/act` | Existing body and receipt shape; invalid body 400; missing slip 404; reset 409; unverifiable reference/evidence 503 |
| `POST /api/dispute` | P1 route unchanged; genuine next-second compatibility rejection works with available interfaces. No context-storage hook is claimed |
| Explicit proposed fifth evaluator argument | 503 `{error:"Immutable original request context remains an unapproved integration extension."}` |

Missing signing/chain prerequisites, paused sends and outages remain explicit
operational failures, never successful late-permission rejections. The production
self-test is unavailable independently of the working action/dispute APIs.

## Owner coordination — separate, not an all-P2 blocker

[FUTURE_OWNER_SIGNATURES.md](FUTURE_OWNER_SIGNATURES.md) lists the exact recorded
getter proposal, required atomic publication/isolation signatures for owner review,
and existing evaluator slot. None is adopted as a new shared API in this candidate.
`getGeneration` is **already delivered**; no getter-mismatch request is being repeated.
The old package's owner patches remain preserved, unapplied and unapproved. They
are not part of the current P2 source publication or an instruction to apply them.

After those interfaces are approved/delivered, P2 must:

- Create/store context from the gateway's cloned original, actual caller/action,
  trusted resource/scenario, generation and single captured finalized reference;
  atomically publish receipt/context through the approved P3 operation.
- Implement the P1-facing evaluator using the supplied frozen boundary, validate
  caller/action/time/context linkage, and verify each candidate's own signature,
  digest and stamp. A different legitimate amendment ID/digest is expected, not
  itself a failure. Do not require candidate ID/digest to equal the original.
- Bind a fresh P1 service and gateway to **one** approved isolated store per run.
  Guard child admission and every await/write with that store's generation;
  close only after outstanding operations settle. No loopback child requests.
- Reuse the existing process-wide P1 chain facade/ledger: never construct another
  production sender, reset its queue, discard unresolved transactions or replenish
  its process-wide allowance through session resets.
- Wire the production factory into the **existing** router, verify actual allowed
  data values in the integrated sequence, and replace both TODOs only with tests
    against the delivered interfaces. Do not enable a fake factory or live label.
    The offline child-process harness must NOT become a live worker: that would
    split the sender queue and replenish the per-process allowance.

## Evidence decision and remaining scope

Current-main `docs/DEMO_HANDOFF.md` and
`docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md` say attempts still need their own agreed
evidence. Request rows are application history; `Receipt.explorerUrl` is the
checked permission's link, **not** a request/receipt commitment. No approved
encoding, release/retention policy or transaction allowance for attempt commitments
was found. This continuation does not select that extension.
The newer `docs/ATTEMPT_RECORDING_HANDOFF.md` supplies a detailed proposal, explicitly
**not approved or implemented**. It does not authorize consuming its fields,
encoding, recorder APIs or suggested budget. No later approval was found.

The compatibility candidate passes `npm run typecheck`, `npm run build`,
the current-main offline tests and the focused P2 suite. The existing lockfile
was restored only in the isolated target, resolving the earlier missing-installed
`jszip` issue without changing either manifest or lockfile. Exact counts, logs,
source-publication refs and commands accompany the review package.

No live model/RPC/send, shared-demo reset, production entry-point start, shared-main
application/merge, deployment or Gate 3 run occurred. Source branch publication is
not application or deployment. Aman receives the current P2 source for combined
integration; Rachel coordinates any separately authorized published-URL window.
