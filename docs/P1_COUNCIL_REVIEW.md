# P1 adversarial council review

Prepared for Aman Upadhyay. One review round completed on the current P1 implementation and the candidate two-hour plan. Application source, configuration and chain state were not changed during review.

**Historical review:** These findings describe the pre-implementation code. See `P1_TEAM_HANDOFF.md` for implemented fixes versus remaining owner dependencies and `P1_LIVE_VERIFICATION.md` for the later authorized tests.

## Method and limits

Three independent model-backed reviewers received the same candidate plan and different adversarial briefs. One performed a security/code review; the other two challenged delivery feasibility and teammate integration. This is not a guaranteed mixture of model vendors, a formal security audit, or three additional engineers assigned to implementation.

The main agent checked material findings against the local code and fetched upstream changes, then revised `P1_TWO_HOUR_PLAN.md`. No additional app tests or real broadcasts ran. The previous passing test/typecheck/build results remain historical evidence; they do not prove a live application anchor.

## Verdicts

| Reviewer | Verdict | Main objection |
| --- | --- | --- |
| Security/correctness | Conditional go for a trusted demo; no-go for stronger proof claims | Actual gateway timing is still timestamp-based; mutable server history is not independent proof |
| Delivery feasibility | No-go for an unconditional integrated two-hour promise; conditional go for P1 hardening | Retrying safely, teammate interfaces and real verification are more work than the candidate schedule allowed |
| Integration/operations | Conditional go for P1-only work; no-go for current full-product readiness | Ownership, stale sessions, upstream mock behavior and UI evidence semantics remain unresolved |

**Reconciled recommendation:** commit to P1 hardening/handoff within the budget. Pursue integrated acceptance only if owner delivery and explicit transaction permission are established early. Do not present conditional work as completed.

## Findings and disposition

### 1. Block-order protection exists only as a helper

**Observed:** `server/gateway/checks.ts` compares anchor timestamp to action time. `server/gateway/gateway.ts` captures only a timestamp. `server/chain/chain.test.ts` tests same-second ordering through the new helper, not the actual gateway. The dispute route's next-second wait masks the demo symptom rather than fixing the rule.

**Disposition:** require a retained finalized request reference and a gateway-level same-second regression before any end-to-end ordering claim. This is Jay/P1 coordinated work, not a P1-only pass.

### 2. Fixed IDs are not historical evidence

**Observed:** `server/state.ts` overwrites a slip under the fixed mandate ID and resets receipt numbering. `server/routes/slips.ts` retrieves the latest slip by the blocked receipt's ID instead of the exact original snapshot.

**Disposition:** preserve public API identifiers for compatibility, but use generation-scoped internal request/operation identities and retain the exact original permission snapshot/digest. Reissuing a permission must not rewrite the meaning of a recorded request.

**Limit:** an in-memory snapshot is an application consistency control, not tamper-proof evidence against the server operator. Receipt commitments remain outside this two-hour scope.

### 3. HTTP retries are not ledger retries

**Observed:** each `POST /api/slips` creates a new random nonce/signature/digest. Ledger deduplication only recognizes an existing digest, so it does not prevent sequential HTTP retries from generating new logical operations.

**Disposition:** retain one original issuance per session/scenario and one amendment per blocked receipt; retries resume the same signed operation. Reset is an explicit new-session boundary. Test lost HTTP responses as well as lost broadcast replies.

### 4. The pending queue can be stuck on a never-accepted transaction

**Observed:** `server/chain/ledger.ts` catches all send failures as uncertain and requires pending settlement before issuing another transaction.

**Risk:** a definitely rejected transaction that never appears can indefinitely block later operations. Provider errors are currently sanitized without a detailed internal rejection classification.

**Disposition:** add safe internal failure classes. Release/retry only when evidence establishes a definitive non-acceptance; once any attempt is ambiguous, retain the original identity. Bound investigation time. If safe automatic recovery does not fit, expose fail-stop/manual reconciliation and mark automatic recovery incomplete. Never skip a nonce or fabricate success.

### 5. Reset protection must cover the entire async pipeline

**Observed:** gateway code reads a slip, awaits verification, then may call data and write a receipt without a session-generation guard. `server/routes/agent.ts` awaits model proposals before dispatching tools; a pre-reset run can therefore start actions against a newly granted session. P1 alone cannot solve this by guarding its two routes.

**Disposition:** Rachel supplies monotonic state generation and guarded publication. Jay captures generation before model await and propagates it through gateway/data access. P1 captures it for issue/dispute operations. Rachel guards stale browser refresh responses as well. A local browser animation token is not server access control.

### 6. Funded signing endpoints need a bounded demo budget

**Observed:** `POST /api/slips` is reachable without app authentication and can broadcast using the server's funded issuer. The current operation mutex limits concurrency, not cumulative sends.

**Disposition:** keep a dedicated minimally funded test wallet, one sending process, idempotent operations and a small unique-send cap that reset cannot replenish. Do not introduce a full auth system in this window or claim this is production abuse prevention.

### 7. Eight seconds is not currently an end-to-end deadline

**Observed:** initial chain reads, anchoring and gateway lookup each receive independent deadlines. Dispute also has a next-second loop with an awaited RPC that may exceed the nominal loop timeout.

**Disposition:** propagate a complete-operation deadline or expose honest pending/error states. Measure the entire route/UI path. The original sub-eight-second scene criterion remains unverified until measured; a timeout budget is not a performance measurement.

### 8. Upstream UI and mode selection can misrepresent evidence

**Observed in fetched main:** browser `?mock=1` intercepts API calls independently of server `MOCK_CHAIN`; server agent proposals remain canned. New stage UI has rejection/late-stamp text based on generic result or timestamp relationships. A later block sharing the same timestamp may lack a late marker, while an unrelated verification failure may be described as late permission.

**Disposition:** preserve Rachel's UI but agree narrow evidence wording and mock-status corrections. Check browser, server, model and deployment independently. No badge is not proof of live behavior. Do not equate a forced gateway run with a real model interaction.

### 9. Finality rests on a trusted RPC boundary

**Observed:** ledger lookups validate hashes/status/finalized height; helper inputs are ordinary objects. The helper cannot independently prove that an arbitrary caller-provided reference is canonical.

**Disposition:** accept references only from server-observed ledger reads, never the browser. Match the candidate transaction hash to its lookup. Use a consistent canonical chain view, reject contradictory provider evidence, and document that this is trusted-RPC verification rather than a standalone light-client proof. A full proof system is outside scope.

## Changes made to the plan after review

- Replaced guaranteed full-demo completion with a P1 commitment and conditional integrated target.
- Moved owner delivery commitments and transaction authorization to the first gate.
- Made HTTP retry identity, historical snapshots and reset-independent send limits explicit.
- Included action/model/browser reset races, not just P1 route state writes.
- Allowed conservative fail-stop behavior instead of claiming guaranteed automatic recovery.
- Froze new features at minute 80, preserving test and handoff time.
- Made a second real run a goal after first-run success, not an unconditional deadline promise.
- Separated workspace, browser-mock, server-mock, live-model and deployment evidence.
- Kept migration, receipt commitments, production hardening and live-model implementation outside P1's core budget.

## Decisions still required

1. Execution workspace: remain here for P1 verification, or migrate before implementation?
2. Cross-owner integration: can Jay and Rachel deliver in parallel, or is a narrow coordinated patch authorized? Solo cross-owner permission does not guarantee time for the same full scope.
3. Real testnet permission: may the implementation phase use up to five zero-value testnet transactions, gas only, or must real application writes remain deferred?

Default evidence scope is a trusted-server demo with honest limitations, not independently auditable request history. If that is insufficient, the deliverable and deadline must change.
