# Envoi — P3 build plan (Product, UI and demo)

Owner: Rachel (P3). Source of truth: `ENVOI_BUILD_SPEC.md` (sections 7, 8, 11) and `attached_assets/P3_FRONTEND_PROMPT_1792850963631.md`. If this plan and the spec disagree, the spec wins, except where noted under "Decisions".

## 1. What P3 owns

| P3 owns | P3 never edits |
| --- | --- |
| `client/**`, `shared/scenarios.ts`, `server/state.ts`, `server/routes/state.ts`, `server/index.ts` (mounting only), `docs/**`, deployment config | `server/chain/**`, `server/routes/slips.ts` (P1) · `server/gateway/**`, `server/data/**`, `server/agent/**`, `server/routes/act.ts`, `server/routes/agent.ts`, `server/routes/selftest.ts` (P2) |
| `shared/contract.ts` only with all three people agreeing | |

## 2. Where things stand

- Scaffold is merged: one Express process, Vite React client, in-memory state, `/api/state`, `/api/reset`, `/api/health`, contract and consulting scenario, `MOCK_CHAIN=1` in dev.
- Every P1/P2 route already exists in contract shape (stubbed slip signing, mock ledger, canned agent proposals, selftest returns 501). The UI can be finished end to end today against these.
- Client is at "wired scaffold" level: buttons, keyboard shortcuts, basic slip card, plain decision cards, a text list for the public record. Missing: check stagger + stamp animation, full slip and amended cards, "Atlas asks for" chips, margins table, plotted timeline with dispute bracket, `?mock=1`, counter roll, reset confirm, reduced motion.

## 3. Decisions

- **Brand:** keep the current light theme in `client/src/styles.css` (porcelain/navy/blue, Segoe UI Light, logo) — it is the most recent deliberate change and replaces the dark tokens in spec section 8. Keep the spec's rules that matter on a projector: stamp words ≥ 40px, good/bad colors, mono for evidence.
- **Outcome is never decided in the browser.** The UI only renders receipts and slips from the server. The only exception is `?mock=1`, which shows a MOCK badge.
- **No protected data in the client.** Margins appear only from `receipt.data`.

## 4. Integration contract with P1 and P2 (what the UI must handle)

### From P1 (chain, slips, dispute)
| Fact | UI consequence |
| --- | --- |
| `POST /api/slips` returns a Slip with `label:"Original"`; on the real chain it takes ~1–3 s | Show "Northwind is signing. Stamping on Monad…"; all buttons disabled |
| `slip.anchor` can be `null` in the type | Render "Not stamped yet" instead of crashing |
| Stamp time = `anchor.blockTimestamp` (chain time, unix seconds) | Always format chain seconds, never `createdAt` |
| `POST /api/dispute` creates a Slip `label:"Amended"`, `mandateId northwind-atlas-001-amended`, `issuedAt` = Monday 9:00 AM New York | "Dated" line formats `mandate.issuedAt` (do not hardcode "Monday") |
| Dispute receipt: `kind:"dispute"`, `source:"forced"`, `decision:"REJECTED"`, `actionTime` = the blocked request's time, `explorerUrl` = amended stamp | Scene 3 is detected by `kind:"dispute"`; bracket = amended `anchor.blockTimestamp − blocked actionTime` |
| Dispute waits for chain time to pass the blocked request, so it can take several seconds | Keep loading state; no client timeout below 20 s |
| 409 "Run the hidden note scene first." / "Sign the permission slip first." | Show sentence in bouncer column |
| With real chain, `stamped` can fail with "Could not reach Monad to verify the stamp" | Show the check's `detail` as-is |

### From P2 (bouncer, agent, selftest)
| Fact | UI consequence |
| --- | --- |
| Checks always five, order signed, agent, valid, stamped, scope; labels come from server | Render `receipt.checks` verbatim; never rename |
| `/api/agent/run` returns 1–3 receipts (poisoned run usually margins + salaries) | Show up to 2 cards, BLOCKED/REJECTED on top |
| Agent may fail with 502 "The AI service did not answer. Use Force the request." | Show sentence; Force button stays usable |
| `proposedCalls` may contain an unknown tool name | Chip falls back to a readable label, never crashes |
| ALLOWED margins `data` is an array of `{region, revenueM, marginPct, changePts}` | Margins table: Region, Margin %; bold the two lowest |
| `/api/selftest` returns `{pass, steps}` (501 until P2 lands it) | Pre-flight panel shows "not built yet" until then |
| `/api/health` returns `{ok, mockChain, issuer, rpc}` | Header shows a small "MOCK CHAIN" badge whenever `mockChain` is true, so nobody rehearses on the mock by mistake |

### Gate checks that involve P3
- **Gate 1 (10:45):** UI renders slip, checks and receipts on the mock chain.
- **Gate 2 (12:00):** scenes 1, 2a, 2b run from the UI with `MOCK_CHAIN` off (P3 confirms the MOCK CHAIN badge is gone).
- **Gate 3 (1:30):** `/api/selftest` passes twice on the demo URL; P3 runs it from the pre-flight panel.
- **2:00 feature freeze**, then bug bash, backup video (P3 drives), five timed rehearsals.

## 5. Work items, in demo-priority order (cut from the bottom if late)

1. **Bouncer column** — 120 ms check stagger, stamp landing, BLOCKED card on top, ALLOWED margins table, REJECTED copy, errors as one sentence.
2. **Slip column** — full original card (For / Can see / Cannot see / Valid until / Signed / Stamped with time + block / public record link), amended card for scene 3, original dims to 60%.
3. **Report column** — hidden note invisible but in DOM; reveal cross-fade; "Atlas asks for" chips colored by decision, "forced" tag; scene 3 quote card.
4. **Public record timeline** — markers plotted by chain time, labels, explorer links, dispute bracket "stamped Xm Ys after the request".
5. **Header + control bar** — step pills, counter roll, MOCK / MOCK CHAIN badges, disabled-reason tooltips, Reset "press again" confirm, keys 0–6.
6. **`?mock=1` client mock** — contract-shaped fake responses, 900 ms delay, all six steps.
7. **Pre-flight panel (`?preflight=1`)** — health + run self-test, for rehearsals and after each deploy.
8. **Polish** — reduced motion, 1440×900 at 125% with no page scroll, jargon sweep of rendered text.
9. **Stretch, only after Gate 3** — scenario picker.

## 6. Acceptance (P3 done)

- `?mock=1` runs all six steps end to end with the MOCK badge.
- Without mock, every button calls its endpoint; errors show as one sentence.
- 1440×900 at 125%: no page scroll; stamp words ≥ 40px.
- Hidden note invisible until key 1, still in DOM text.
- Two receipts → BLOCKED card on top.
- Scene 3 shows both slip cards, the REJECTED card and the timeline bracket.
- Rendered text never contains mandate, gateway, digest, hash, EIP-712, nonce, transaction.
- Keys 0–6 work; reduced motion shows final states.
- No files changed outside P3 paths.
- Deployed as Reserved VM; demo URL loads; secrets present in the deployment.
