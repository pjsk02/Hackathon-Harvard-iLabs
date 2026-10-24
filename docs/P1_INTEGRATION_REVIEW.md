# P1 branch integration review — 2026-10-24

Reviewed `origin/p1/signing-and-dispute-evidence` without merging or editing P1
files. All **38 offline tests passed independently** in a detached temporary
checkout. Those tests use controlled RPC/ledger dependencies; no live sends were
made from this workspace. P1's live-run document is its author's evidence, not
an independently reproduced live run here.

The P1 suite was also run against the current P3 state module and routes in the
temporary checkout: **48 combined offline checks passed** (P1's 38 plus P3's 10).
This confirms compatibility for the covered paths, not the remaining live
request-context or attempt-recording integration.

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
5. **Do not merge workspace baggage blindly.** The branch includes `.replit`,
   unrelated workspace/memory metadata and a project ZIP containing Git internals.
   Exclude the archive/unrelated workspace metadata, preserve this app's
   deployment settings and inspect the archive for exposure without assuming
   it is safe. No secret contents were inspected in this review.

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
