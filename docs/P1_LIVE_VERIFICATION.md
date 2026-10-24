# P1 live Monad verification

**Date:** 2026-10-24, completed around 15:35 UTC / 11:35 AM New York.

**Scope:** P1 chain/permission work and forced gateway calls in the development workspace. Not a production, live-LLM, or independent request-history audit.

## Result

**PASS for the tested legacy-compatible flow.** One initial real signing/anchor/readback check, followed by two complete sign → allow/block → dispute runs, with Reset between runs.

- Approved allowance: at most **5** zero-value Monad testnet transactions.
- Actually used: **5**; each cost **0.00306 test MON**.
- Total charged: **0.0153 test MON**.
- Wallet balance afterward: **4.9847 test MON**.
- All five transactions: chain ID 10143, successful receipt, finalized block, zero value, issuer-to-self destination, exact permission fingerprint payload, valid recovered issuer signature.
- The second phase's wallet transaction count increased by exactly four. HTTP retries and the ineligible dispute added no transactions.

The active process has exhausted its allowance. The development configuration is set back to zero for subsequent starts. No extra sends are authorized; restarting must not be treated as a new test allowance.

## Transaction evidence

| Check | Finalized block | Public transaction |
| --- | --- | --- |
| Initial original-permission smoke | 73,848,513 | [0xe578f0…f198](https://testnet.monadvision.com/tx/0xe578f043292071ad11a129607297d75420983c2ef86e35b61ee4fe80df94f198) |
| Run 1 original permission | 73,850,370 | [0xc47e5c…7628](https://testnet.monadvision.com/tx/0xc47e5cf07a6a30546f932cf18a5d3dabed472fbab499374c6f0e19de903f7628) |
| Run 1 genuine amendment | 73,850,378 | [0x610be5…96cd](https://testnet.monadvision.com/tx/0x610be5509566283cd0197ae8e2a697c0a6be907690657f52b4f6c13978a296cd) |
| Run 2 original permission | 73,850,383 | [0xa8f9ea…22c5](https://testnet.monadvision.com/tx/0xa8f9ea325dbb55b4ffc942a2865a94b569b13614f5b2d8eb7fa5066dbd0a22c5) |
| Run 2 genuine amendment | 73,850,391 | [0x6705ad…ce1b](https://testnet.monadvision.com/tx/0x6705ad80b78e3f4b833aba7495668147e619819942c7f067a45323a9d25fce1b) |

Evidence was read back from the public RPC and checked against canonical block/transaction/receipt fields. These links are provided for inspection; explorer indexing is not the verification mechanism.

## Both real runs verified

1. Original permission has a genuine signature and finalized stamp.
2. Retrying issuance returns the same permission and stamp.
3. Regional margins request: ALLOWED, all five checks pass, approved data returned.
4. Wrong agent: BLOCKED, agent check fails, data null.
5. Attempting a dispute with only that ineligible block returns 409 without creating an amendment.
6. Salary request with the correct agent: BLOCKED, scope only fails, data null.
7. Genuine expanded, backdated amendment: REJECTED, stamped only fails, data null, original expiry retained.
8. Retrying the dispute returns the same receipt, without incrementing the receipt counter or creating another transaction.
9. Reset after the first completed run permits the second run.

## Observed API timing

| Operation | Run 1 | Run 2 |
| --- | ---: | ---: |
| Original issuance | 1,696 ms | 1,197 ms |
| Allowed request | 71 ms | 70 ms |
| Scope-blocked request | 70 ms | 69 ms |
| Dispute | 2,204 ms | 2,420 ms |

The initial smoke check, including additional independent readback, took 1,899 ms. These are individual observed API timings through the preview proxy, not browser-animation timings, guarantees under load, or a production latency SLA.

## Offline and visual checks

- TypeScript check: passed.
- Build: passed.
- Offline test runner: **38 tests passed**, none failed.
- Coverage includes all signed-field mutations, pending/rejected/uncertain broadcast handling, count/price limits, retry identity, original snapshot changes, reset guards with an injected generation adapter, same-second block ordering with an injected context-aware evaluator, and shared operation deadlines.
- The running preview rendered both real permissions and the ALLOWED/BLOCKED/REJECTED timeline after the final run.
- No UI code or P2/P3 implementation was changed to produce these results.

## Important limits / remaining team work

- The unchanged gateway remains timestamp-based. The real runs used the bounded next-second compatibility path. They do **not** prove the actual gateway now rejects a later block in the same second.
- The unchanged state module has no generation getter. Tests with injected state adapters do **not** establish full empty-session reset-in-flight protection in the current app.
- Agent proposals remain scripted; these runs deliberately used the real forced-request endpoint and did not claim a live model interaction.
- The original request history remains server-controlled and resettable. A Monad transaction proves permission-fingerprint inclusion, not the truth or completeness of the server's request log.
- Pending reconciliation and spending guards are per-process. Durable restart recovery, authentication and production abuse protection are outside this milestone.
- Jay/Rachel handoff details and the proposed internal interface are in `P1_TEAM_HANDOFF.md`.
