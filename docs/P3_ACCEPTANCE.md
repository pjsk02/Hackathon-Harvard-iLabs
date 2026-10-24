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
| Pre-flight | Health and self-test controls; configuration is not mislabeled as live-chain verification. |
| No simulation path | Client mock removed; all API requests use the server. Stub/mock transcripts produce an explicit error. |
| Reset safety | Generation hook and API request context prevent pre-reset operations from writing slips/receipts into the next session, including from another tab. |

## Verification

- TypeScript check and production client build pass.
- Nine reset tests pass, including actual local HTTP overlap between a delayed write and Reset: `npm run test:state`.
- Browser checks cover ordered controls, upload/reveal and request body, busy guards, two-press Reset, reduced motion, real error handling, evidence links and the 1152×720 viewport (1440×900 at 125%).
- Success-state browser checks use isolated test responses, not a shipping simulation mode. They verify the UI contract, **not** Monad or a live model.

## Not complete / not claimed

| Gate | Owner / dependency |
| --- | --- |
| Real permission signing + Monad readback and request commitments | Aman/P1's updated implementation is not on this workspace's fetched `main` yet. His reported 38 offline tests have not been reproduced here. |
| Block-order evaluation and original request context | Jay/P2 must adopt P1's interface. Timestamp comparison alone is insufficient. |
| Attempt-specific explorer links / commitment status | Await agreed P1/P2 response shape. Current `Receipt.explorerUrl` points at the permission, not an attempt commitment. |
| Live model and uploaded-report consumption | Local agent remains a scripted stub; local route still ignores `upload`. UI delivery of extracted text does not mean Claude read it. |
| Self-test twice on real chain and live model | Current self-test route returns 501. |
| Retry cache integration with Reset | P1/P2 must key or clear caches by the generation hook and check it before returning reused results. Guarded state writes alone do not validate their caches. |
| Published URL + secrets + rehearsals/backup video | Publishing status reports not published. Full demo rehearsal and backup recording remain pending. |

**Conclusion:** the P3 implementation has been completed and checked within the available API contract; the build plan's full live-demo acceptance is not 100% complete.
