# Finalized-context acceptance — separately deferred pending owner agreement

Read [INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md) for the exact current-main
base, working P2 compatibility slice and unavailable production self-test.
Historical checkpoint logs are preserved in their original packages, not reported
as current validation.

## What is available now

P1's finalized chain API and genuine cryptographic helpers are on the candidate's
current-main base. P3's generation aliases and guarded writes are also delivered.
There is **no getter mismatch**. P2's normal gateway now captures one finalized
reference and uses block ordering rather than timestamp precedence. Its standalone
verifier tests cover equal timestamps, mismatched hashes, unfinalized/missing/
inconsistent evidence, sender/destination/value/status/payload, real signatures,
wrong network, caller/resource/scenario, expiry and tampering with zero denied reads.

Those local verifier tests are **not** the two retained-context regressions below.
P3 still lacks context retention/retrieval, atomic publication and isolated state.
The P1/P2 fifth evaluator argument is not yet an agreed consumed interface.
The existing four-argument dispute API works through its explicit next-second
compatibility path. That does NOT establish immutable context or same-second
replay protection. Supplying the proposed fifth argument fails explicitly.
Production self-test remains unavailable without safe isolation. The two original
TODOs below remain TODO and are excluded from passes; they do not block the
owner-authorized compatibility slice.

See [FUTURE_OWNER_SIGNATURES.md](FUTURE_OWNER_SIGNATURES.md) for exact missing
signatures and approval status, not invented exports to import now.

## Required delivered-interface regressions

1. **Frozen original request across identical timestamps.**
   - Use the actual P1 service, actual P2 gateway/evaluator and approved P3 isolated
     store. Original permission at finalized N, request at N+1, amendment at N+2;
     all integer timestamps identical.
   - Normal gateway capture happens exactly once per request. Atomic storage
     retains a cloned original permission, actual caller/action, trusted
     resource/scenario, generation and the verified canonical reference.
   - Retrieve by original blocked receipt ID **and generation**. Mutating input
     objects or retrieved objects cannot mutate retention; reset plus same-ID
     reuse cannot retrieve an older generation.
   - P1 replay receives that context, never a new request reference. Its candidate
     has its own valid signature/digest/ID; fresh verification reads do not replace
     the frozen boundary. Only `stamped` fails, with null data and no salary read.
   - Equal-height/different-hash, wrong network, unavailable/unfinalized and
     inconsistent evidence must not become success or an outage-as-late rejection.
2. **Capture and verification outages under the real composition.**
   - Fail each operation separately, including replay evidence readback after a
     valid blocked original. Assert explicit unavailable results, both protected
     reader counts zero for the failed request, no policy receipt/publication and
     no substituted server-clock/latest/mock boundary or verified claim.
   - Assert generation guards after successful **and rejecting** awaits, before
     data and publication. Reset during an operation, same-object/ID reinsertion,
     retained permission-service retries and delayed admission cannot write to or
     read protected data for the replacement session.
   - HTTP timeout is not cancellation. Do not release the self-test lock while a
     child, possible broadcast or cleanup remains unresolved.

## Future production-isolation sequence acceptance

Use the already mounted `GET /api/selftest`; no new route or mount. Assert exact
`{pass,steps:[{scene,expected,got,ms}]}`, four sequential scenes, genuine original
signature/finalized stamp, forced margins with **actual expected data**, forced
salaries `BLOCKED` with only scope failing/null data, and genuine amended dispute
`REJECTED` with only stamped failing/null data. Assert ordered IDs, identities,
sources and nonnegative elapsed durations. Preserve the shared demo's generation,
slips, receipts and counter before/after isolated repeats, failures and concurrency.

The current suite now also runs the actual P1 issuance/replay service, actual P2
gateway and protected margins, and actual P3 state/middleware twice in a separate
Node process. It checks exact data, every receipt's ordered checks/source/identity,
four-scene response keys/timings, reset invalidation of retained P1 operations and
an unchanged parent-demo snapshot. This is genuine **current-main compatibility**,
using an explicitly mock chain and the existing time-based dispute API.

Separate injected-replay fixtures still test runner failures/deadlines/cleanup.
Neither class verifies the unimplemented stored-context contract, a production
isolated-state factory, live finality, live LLM behavior or Gate 3. Never use that
offline child-process strategy to create another live sender or reset its budget.

## Gate 3 remains pending

Only Rachel can schedule a separately authorized window for **two consecutive
passes against the same current integrated real-chain published version**.
Record that version/URL, both complete responses and wall-clock durations, and
original/amendment transaction/readback provenance. Both runs must use the same
P1 ledger queue, unresolved-transaction reconciliation and process allowance.

The current normal sequence needs an original and amendment per run: at least four
unique permission transactions for the two runs, plus only separately approved
recovery and any later agreed attempt-evidence budget. Never infer authorization
from a configured/funded key. `MONAD_MAX_TRANSACTIONS=0` remains paused. Do not
restart to refill a budget. No historical P1 report, fixture, workspace-only test
or model-forced scene qualifies as either of the two passes.
