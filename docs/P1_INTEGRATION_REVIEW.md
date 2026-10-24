# P1 branch integration review — 2026-10-24

Following review, the user approved integrating **P1 code only, with live sends
paused**. The 15 files under `server/chain/**` and `server/routes/slips.ts` were
imported unchanged from `origin/p1/signing-and-dispute-evidence`. The ZIP,
branch workspace settings, agent metadata/memory and unrelated planning files
were not imported. This is a selective code integration, not a wholesale branch
merge.

All **38 P1 offline tests passed independently** during review. Those tests use
controlled RPC/ledger dependencies, not a live demo. P1's live-run document is
its author's evidence, not an independently reproduced live run here.

The P1 suite was also run against the current P3 state module and routes in the
temporary checkout: **48 combined offline checks passed** (P1's 38 plus P3's 10).
This confirms compatibility for the covered paths, not the remaining live
request-context or attempt-recording integration.

The integrated app keeps `MONAD_MAX_TRANSACTIONS=0` explicitly in development,
with practice-chain mode still off. State tests now also exercise the actual
P1 service against P3's generation hook and ensure a zero allowance reaches
neither a signer nor RPC submission. `npm test` includes the P1 suite.
No live send or live smoke script has been run as part of integration.

The subsequently supplied project ZIP was inspected without extraction: all 14
P1 code/test files match the integrated GitHub version byte-for-byte, with no
additional P1 source files. Its only P1 difference is README wording about the
reset-getter mismatch already addressed by P3's compatibility alias. The ZIP's
Git internals and workspace configuration were not imported.

Final integration checks: 65 offline checks and 8 isolated browser checks pass;
type checking and production build pass. The running app answers read-only
health/state requests with practice mode off. The issuer remains unconfigured,
and no live-chain signing or readback success is claimed.

## Present

- Real EIP-712 signing and signer recovery, exact field checks.
- Zero-value self-records, canonical/finalized evidence checks and bounded RPCs.
- Same signed permission retained across uncertain retries.
- Dispute result reuse and verification that an outage is not a late rejection.
- A paused-by-default, per-process send allowance.

## Integration findings

1. **Reset getter mismatch — P3 compatibility completed.** PermissionState reads
   `getGeneration`; P3 originally exposed `getResetGeneration`. The compatibility
   alias now returns the same counter. This lets P1 invalidate its cached
   operation as well as P3 rejecting stale state writes. Verify the combined
   reset-then-retry path after merging; neither reset guard cancels a broadcast.
2. **Original request context/block ordering — P2/P3 coordination still needed.**
   P1 can consume `getRequestContext(receiptId)` and evaluator argument five;
   current main retains neither that context nor the block-order evaluator.
   Its timestamp compatibility path is not proof of same-second ordering.
3. **Attempts are not recorded on-chain.** P1 records original/amended
   permissions. A dispute receipt's explorer link refers to the amended
   permission. Do not attach that link to an attempt as if it proves the attempt.
   Agree additive evidence fields and implement actual request recording.
4. **A confirmed mined failure can be retried as a new send.** The ledger drops
   a failed pending record; repeating that permission request can use another
   allowance slot. This is different from retrying unknown submission, which
   retains signed bytes. Aman should explicitly confirm/document that policy
   and cover a same-permission retry after a confirmed failed record.
5. **Workspace baggage excluded from this integration.** The branch includes `.replit`,
   unrelated workspace/memory metadata and a project ZIP containing Git internals.
   Those files were excluded and this app's deployment settings preserved.
   The only local configuration change is the explicitly approved zero send
   allowance. The archive still needs owner review/removal on the source branch;
   no secret contents were inspected in this review.

## Before any live run

- A funded demo issuer must be configured through the secrets flow; credentials
  are not brought over by Git.
- `MONAD_MAX_TRANSACTIONS` defaults to zero; changing the allowance is a separate
  explicit decision, not part of code review.
- The allowance is process-local, not a durable public rate limit. Existing
  unauthenticated signing routes represent a demo-held key, not authenticated
  client consent. Avoid leaving funded signing exposed without operational
  controls; do not claim production authorization.
- Review the branch against the latest P3 state and P2 interfaces, then perform
  a bounded real-chain test and verify the actual public records.
