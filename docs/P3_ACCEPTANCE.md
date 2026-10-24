# P3 acceptance audit — 2026-10-24

This is an implementation audit, not a claim that the complete live demo has passed.
The latest user decisions override old mock, timing-display and driver-key requirements.

## Closeout status

The independent P3 correction pass is verified offline. **The judge-ready
closeout is not complete.** No live send, live model run, live self-test, GitHub
integration push, publication, public judge-link verification or genuine backup
recording was performed in this pass. Work is on a task fork, not the live app.

The latest fetched GitHub main has the same application code as the starting
checkout; its additional changes are documentation. The local attempt-recording
handoff remains a proposal. Aman and Jay must still supply the approved working
handoffs and agree the attempt/context interface before their files or the
frozen shared JSON contract are changed.

## Completed P3 implementation

| Area | Evidence |
| --- | --- |
| Demo order | Header and driver controls: 1 Grant, 2 Clean example, 3 Injected example, 4 Monad evidence. R opens/reveals the report; 5 Force and 6 Dispute remain optional. |
| Permissions | For whom, permitted/excluded data, expiry, signature presence and server-supplied public-record links; URL/shape validation is not presented as independent readback verification. |
| Bouncer | Staggered checks, large decision stamp, failed details preserved; failed RPC is not relabeled “late permission.” |
| Returned data | Profitability table from allowed receipt data only, lowest two emphasized, retained below the blocked decision in a two-request run. |
| Upload | Word/text/Markdown/HTML accepted; nested hidden HTML is extracted by text node, once and in order. Text markers and Word hidden runs stay concealed in both layouts until reveal while remaining in the submitted text. |
| Upload limits | 5 MB input file, 60,000 extracted UTF-16 units, 255-character name; a 512 KiB JSON envelope accommodates multibyte and worst-case escaped text. Explicit 400/413 responses reject malformed/oversized uploads before owner routes. |
| Interaction | Visible start instructions, download/upload controls, clickable view switch, two-click New run / Reset, optional shortcuts, focus states, reduced motion, responsive layout. |
| Evidence review | Shows permissions separately from application request history. Does not reuse a permission link to claim the attempt itself is on-chain. |
| Pre-flight | Read-only health/state recheck, visible status beside Grant and a separately requested self-test with side effects disclosed; configuration is not mislabeled as live-chain verification. |
| Request recovery | The exact P2 pre-tool 502 failure unlocks Force. Generic errors, lost replies, malformed results and ambiguous conflicts remain guarded across views/reload. Force is labeled as forced without attributing it to Atlas. |
| Continuity | Tab-local uploads and completed-run references restore only after matching the server session and returned permission/receipt references. Reset/restart invalidates them; no write queue or returned data is stored or replayed. |
| Shared use | One HTTP mutation at a time, including self-test/evaluation. Conflicting actions/Reset return a clear 409; browser disconnection does not release the lock before handler response completion. A stale tab must recheck before writing into a new session. |
| Public-use limits | Twenty admitted non-Reset actions per minute per process; Reset does not refill this limiter. This is not a durable spend allowance or multi-user isolation. The existing zero chain allowance is unchanged. |
| No simulation path | Client mock removed; all API requests use the server. Stub/mock transcripts produce an explicit error. |
| Reset safety | Generation hook and API request context prevent pre-reset operations from writing slips/receipts into the next session, including from another tab; P1-compatible getter alias shares the same counter. |
| Handoff | One current Grant-first script, key map and real-only fallback policy; stale alternate frontend instructions replaced by references to that handoff. |

## Verification

- `npm run typecheck`, `npm test`, `npm run test:ui` and `npm run build` pass.
- **78 offline checks:** 17 state/HTTP, 38 unchanged P1 chain/service, 19 request-transport and 4 presentation-store checks.
- **17 browser checks** cover the original controls plus nested HTML, classic/text concealment, exact known AI-failure Force recovery, unknown-outcome guards, view/reload continuity, multibyte text, honest model refusal, evidence wording, sample use and two independent browsers against the real P3 lock on an isolated test server.
- Success-state browser checks use isolated test responses, not a shipping simulation mode. They verify the UI contract, **not** Monad or a live model.
- Aman's 15 P1 implementation/test files are integrated unchanged; `npm test` now also runs his offline chain/service suite. No live sends were used for integration.
- The running development sample download returned HTTP 200 and matched the supplied demo Word file byte-for-byte.
- No changes in this correction pass touch `server/chain`, `server/gateway`, `server/data`, `server/agent`, teammate-owned routes or `shared/contract.ts`.

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
| Optional dispute | Both UIs leave the control disabled until original-request evidence and a genuine live dispute are verified. It is not counted as completed or replaced by a fabricated rejection. |
| Main-app integration | This fork's changes must be merged by the project workflow; local verification is not a GitHub main push or a deployed version. |

**Conclusion:** the P3 correction pass is checked within the available interfaces.
The real-model, attempt-recording, approved live acceptance and public-link
requirements remain blocking; they have not been silently cut.
