# P1 adversarial review

Sat Oct 24, ~12:40 ET. Reviewer: Aman (P1). Scope: `server/chain/*` and `server/routes/slips.ts` as merged on `main` in `fd9079d`, which is byte-identical to `p1/signing-and-dispute-evidence` at `96255e4`.

## Verdict

The code is sound and fails closed. **As configured, it cannot stamp on real Monad**, because the transaction limit defaults to zero. Set `MONAD_MAX_TRANSACTIONS` (fix 1) before any live run or deployment.

## What was run

| Check | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| `npm run test:state` / `test:chain` / `test:client` | 12 / 38 / 15 pass, 0 fail |
| Mock chain (test key), 3 full runs with Reset between | margins ALLOWED; salaries BLOCKED (only `scope` fails); dispute REJECTED (only `stamped` fails) |
| Dispute repeated | same receipt returned, nothing new recorded |
| Reset, then dispute | 409 "Sign the permission slip first." |
| Salaries before Sign | 404, no data |
| Two Signs at the same time | same slip returned to both |
| `/api/agent/run` (poisoned report) with P2 stub | margins ALLOWED, salaries BLOCKED through the gateway |
| Production-like env (no `MOCK_CHAIN`, no `MONAD_MAX_TRANSACTIONS`) | Sign refused: "Real Monad transactions are paused until a test limit is approved." |

Live Monad evidence for the pre-merge branch is in `P1_LIVE_VERIFICATION.md` (5 transactions; Sign 1.2–1.7 s, Dispute 2.2–2.4 s).

## Findings, most serious first

1. **Real stamping is disabled by default.** `ledger.ts` reads `MONAD_MAX_TRANSACTIONS ?? "0"`. `.replit` sets it to `"0"` in development, and the deployment does not set it at all. **Fix:** Replit Secret `MONAD_MAX_TRANSACTIONS=200` in both the workspace and the deployment, then restart.
2. **The limit is per process lifetime and never refills.** `reservedTransactions` only goes down when a submission definitely failed. Each run uses 2 transactions, so rehearsals use up the budget, and once it runs out Sign fails until a restart. **Fix:** set a generous limit (200 transactions is at most about 1.2 test MON at the gas cap) and restart the deployment right before demos.
3. **Gas price cap of 200 gwei.** Observed cost was about 0.00306 MON per stamp, which is about 102 gwei, so there is about 2× headroom. A testnet fee spike makes Sign refuse with a spending-limit message.
4. **8 s budget for each Sign and Dispute**, including the wait for finality. On a slow RPC the user gets "awaiting verification … Retry". Retry is safe: it reuses the same transaction. The UI should show this as a retry, not as a failure.
5. **The mock needs `ISSUER_PRIVATE_KEY`.** There is no built-in fallback key any more. If the team falls back to `MOCK_CHAIN=1` on stage, any throwaway key works.
6. **The merged path has not been live-tested.** On `main`, `state.getGeneration` exists, which enables the reset-tracking path in `permission-service.ts`. The 5 live transactions predate the merge, so that path has been checked only on the mock and in unit tests. The first real run on `main` is the real check.
7. **Every RPC call is preceded by `eth_chainId`.** This doubles the number of round trips. Measured latency is still fine, so no change is needed.

## What held up

- Request time comes from the latest finalized Monad block. There is no server-clock fallback.
- `slip.ts` rejects unexpected fields before signing, so no unsigned field can be slipped in.
- Pending transactions are reconciled before a new nonce is used, and the same signed bytes are rebroadcast on retry.
- RPC errors are sanitized, and a wrong-chain RPC is rejected before any signed bytes are sent.
- The dispute is recorded only if exactly `stamped` fails for a "late" reason. A Monad outage cannot pose as a late stamp.

## Merge notes (P1 branch → main)

- Code: no conflicts. Every `server/` file on the branch already matches `main`.
- Conflicts in `.replit`, `server/chain/README.md` and two `.agents/memory` files were resolved by keeping `main`'s versions. Main has the deployment section, the `getGeneration` alias already exists, and the shared agent memory is left unchanged.
- Not merged: branch workspace metadata (`.agents/agent_assets_metadata.toml`, P1-only agent memory files), the uploaded zip archive, and untracked `attached_assets/`.
- Added: `P1_COUNCIL_REVIEW.md`, `P1_LIVE_VERIFICATION.md`, `P1_TEAM_HANDOFF.md`, `P1_TWO_HOUR_PLAN.md`, and this file. Parts of `P1_TEAM_HANDOFF.md` predate the merge. Where they disagree, `main`'s code wins.

## Still open (P2/P3)

- `/api/agent/run` is still the P2 stub (scripted proposals). `/api/selftest` returns "not built yet".
- `getRequestContext` (block-ordered dispute evidence) is not implemented, so the dispute uses the next-second timestamp path.
