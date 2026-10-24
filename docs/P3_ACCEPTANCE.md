# P3 acceptance audit — 2026-10-24

This is an implementation audit, not a claim that the complete live demo has passed.
The latest user decisions override old mock, timing-display and driver-key requirements.

## Completed P3 implementation

| Area | Evidence |
| --- | --- |
| Demo order | Header and driver controls: 1 Grant, 2 Clean example, 3 Injected example, 4 Monad evidence. R opens/reveals the report; 5 Force and 6 Dispute remain optional. |
| Permissions | For whom, permitted/excluded data, expiry, signature presence, recorded block/time and genuine explorer links; missing evidence is explicit. |
| Bouncer | Staggered checks, large decision stamp, failed details preserved; failed RPC is not relabeled “late permission.” |
| Returned data | Profitability table from allowed receipt data only, lowest two emphasized, retained below the blocked decision in a two-request run. |
| Upload | Word/text/Markdown/HTML accepted; preview/reveal; extracted hidden text included in the request body. An uploaded report survives running the clean example and is used by step 3. |
| Interaction | Request counter, disabled controls during work, keyboard shortcuts, two-press Reset, focus states, reduced motion, responsive layout. |
| Evidence review | Shows permissions separately from application request history. Does not reuse a permission link to claim the attempt itself is on-chain. |
| Pre-flight | Read-only health/state recheck, visible status beside Grant and a separately requested self-test with side effects disclosed; configuration is not mislabeled as live-chain verification. |
| Request recovery | Bounded requests and response reads, explicit malformed-response errors, no automatic write retry, unconfirmed-action guard across view changes/reload and manual reconciliation. |
| No simulation path | Client mock removed; all API requests use the server. Stub/mock transcripts produce an explicit error. |
| Reset safety | Generation hook and API request context prevent pre-reset operations from writing slips/receipts into the next session, including from another tab; P1-compatible getter alias shares the same counter. |
| Handoff | One current Grant-first script, key map and real-only fallback policy; stale alternate frontend instructions replaced by references to that handoff. |

## Verification

- TypeScript check and production client build pass.
- State tests cover actual local HTTP overlap between a delayed write and Reset, P1 getter compatibility, reset/retry in the integrated P1 service, and zero-allowance safety: `npm run test:state`.
- Fifteen request tests pass for timeouts, response-body deadlines, malformed data, uncertainty persistence, duplicate calls, readonly recovery, paused-send configuration and reset boundaries: `npm run test:client`.
- Eight runnable browser checks cover ordered controls, upload/reveal and request body, invalid uploads, busy guards, two-press Reset, lost-response recovery, reduced motion, error handling, evidence links and projector/mobile viewports: `npm run test:ui`.
- Success-state browser checks use isolated test responses, not a shipping simulation mode. They verify the UI contract, **not** Monad or a live model.
- Aman's 15 P1 implementation/test files are integrated unchanged; `npm test` now also runs his offline chain/service suite. No live sends were used for integration.

## Not complete / not claimed

| Gate | Owner / dependency |
| --- | --- |
| Live permission signing + Monad readback | Aman's implementation is integrated and offline-tested. Live sends remain explicitly paused at zero; issuer setup and a separately approved live test are still required. |
| Block-order evaluation and original request context | Jay/P2 must adopt P1's interface. Timestamp comparison alone is insufficient. |
| Attempt-specific explorer links / commitment status | Await agreed P1/P2 response shape. Current `Receipt.explorerUrl` points at the permission, not an attempt commitment. |
| Live model and uploaded-report consumption | Local agent remains a scripted stub; local route still ignores `upload`. UI delivery of extracted text does not mean Claude read it. |
| Self-test twice on real chain and live model | Current self-test route returns 501. |
| Retry cache integration with Reset | P3 now exposes P1's expected `getGeneration` getter; combined live reset/retry acceptance still remains. P2 must retain and check original request context. |
| Published URL + secrets + rehearsals/backup video | Publishing status reports not published. Full demo rehearsal and backup recording remain pending. |

**Conclusion:** the P3 implementation has been completed and checked within the available API contract; the build plan's full live-demo acceptance is not 100% complete.
