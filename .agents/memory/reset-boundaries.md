---
name: Reset protection boundary
description: Why P3 reset guards do not finish the teammates' retry-cache integration
---
Reset protection has two independent responsibilities: prevent stale writes into the new demo session, and prevent old cached results from being returned as new-session results. Completing the first is not proof the second is complete.

**Why:** P1 and P2 develop independently. P3 can protect shared state without editing their routes, but their idempotency/retry caches and original request evidence must still respect the same reset boundary.

**How to apply:** when integrating a teammate's push, check both delayed writes and reused results after Reset. Do not describe Reset as cancelling or erasing an already broadcast public-chain record. Keep live integration acceptance separate from offline unit-test results.

Unconfirmed browser actions use a conservative recovery guard rather than automatic retries or treating an empty state read as a failed action.

**Why:** the shared API has no authoritative operation-status endpoint, and an aborted or lost response can outlive the browser while public-chain work completes. Absence from the in-memory record is not evidence of cancellation.

**How to apply:** future retry/status UX must distinguish a confirmed outcome from unknown completion. A cleared display, page reload, or responding health endpoint cannot establish that the earlier action stopped.
