# Envoi — P3 build plan (Product, UI and demo)

Owner: Rachel (P3). Source of truth: `ENVOI_BUILD_SPEC.md` (sections 7, 8, 11) and `attached_assets/P3_FRONTEND_PROMPT_1792850963631.md`. If this plan and the spec disagree, the spec wins, except where noted under "Decisions".

## 1. What P3 owns

| P3 owns | P3 never edits |
| --- | --- |
| `client/**`, `shared/scenarios.ts`, `server/state.ts`, `server/routes/state.ts`, `server/index.ts` (mounting only), `docs/**`, deployment config | `server/chain/**`, `server/routes/slips.ts` (P1) · `server/gateway/**`, `server/data/**`, `server/agent/**`, `server/routes/act.ts`, `server/routes/agent.ts`, `server/routes/selftest.ts` (P2) |
| `shared/contract.ts` only with all three people agreeing | |

## 2. Where things stand

- Current audit and verification evidence: [P3_ACCEPTANCE.md](P3_ACCEPTANCE.md).
- Stage controls follow Rachel's current order: **1 Grant → 2 Clean example → 3 Injected example → 4 Monad evidence**. R previews/reveals the report; 5 Force and 6 Dispute are optional, not the primary story.
- P3's client and reset-generation protection are implemented. Complete live acceptance still requires P1/P2 integration and a published rehearsal.
- P1's code-only integration is present with live sends paused; P2's block-order/request-context and real-agent integration still remain.
- The audited concealment, upload-limit, Force recovery and view/reload defects
  are corrected and tested on the task fork. Shared-run admission protection is
  in the P3 HTTP scaffold. This is not a main push or published judge-link pass.
- `MOCK_CHAIN` remains off. Browser-only mock mode has been removed; even `?mock=1` uses live API calls.
- Rachel explicitly removed the elapsed-time/bracket display from scope. Underlying permission/request ordering must still be correct.

## 3. Decisions

- **Brand:** keep the current light theme in `client/src/styles.css` (porcelain/navy/blue, Segoe UI Light, logo) — it is the most recent deliberate change and replaces the dark tokens in spec section 8. Keep the spec's rules that matter on a projector: stamp words ≥ 40px, good/bad colors, mono for evidence.
- **Outcome is never decided in the browser.** The UI only renders server results, with no browser mock exception; scripted agent responses are shown as an error rather than presented as live AI.
- **No protected data in the client.** Margins appear only from `receipt.data`.
- **UI guidance:** follow the GitHub repo's `.agents/skills/envoi-ui/SKILL.md` for every UI change; the current light theme and the user's latest flow override older dark-theme/driver-order examples.
- **Truthful evidence:** a permission's explorer URL is not proof an attempt was recorded. Until the agreed attempt-evidence fields arrive, attempts say “Not recorded on Monad.”

## 4. Integration contract with P1 and P2 (what the UI must handle)

### From P1 (chain, slips, dispute)
| Fact | UI consequence |
| --- | --- |
| `POST /api/slips` returns a Slip with `label:"Original"` | Show “Signing & recording on Monad…”; all controls disabled until completion |
| `slip.anchor` can be `null` in the type | Render "Not stamped yet" instead of crashing |
| Stamp time = `anchor.blockTimestamp` (chain time, unix seconds) | Always format chain seconds, never `createdAt` |
| `POST /api/dispute` creates a Slip `label:"Amended"`, `mandateId northwind-atlas-001-amended`, `issuedAt` = Monday 9:00 AM New York | "Dated" line formats `mandate.issuedAt` (do not hardcode "Monday") |
| Dispute receipt: `kind:"dispute"`, `source:"forced"`, `decision:"REJECTED"`, `actionTime` = original blocked request | Optional dispute view; “Added after the request” only when the failed stamped check actually reports that cause; no elapsed-time bracket |
| Dispute waits for chain time to pass the blocked request, so it can take several seconds | Keep loading state; no client timeout below 20 s |
| 409 "Run the hidden note scene first." / "Sign the permission slip first." | Show sentence in bouncer column |
| With real chain, `stamped` can fail with "Could not reach Monad to verify the stamp" | Show the check's `detail` as-is |

### From P2 (bouncer, agent, selftest)
| Fact | UI consequence |
| --- | --- |
| Checks always five, order signed, agent, valid, stamped, scope | Stage shows three summary passes plus every failure; failed details remain verbatim (current handoff overrides the older five-visible-check layout) |
| `/api/agent/run` returns 1–3 receipts (poisoned run usually margins + salaries) | Show up to 2 cards, BLOCKED/REJECTED on top |
| Agent may fail before any tool with the exact 502 "The AI service did not answer. Use Force the request." | Show sentence; Force stays usable only for this confirmed pre-tool error; unknown outcomes remain guarded |
| `proposedCalls` may contain an unknown tool name | Chip falls back to a readable label, never crashes |
| ALLOWED margins `data` is an array of `{region, revenueM, marginPct, changePts}` | Margins table: Region, Margin %; bold the two lowest |
| `/api/selftest` returns `{pass, steps}` (501 until P2 lands it) | Pre-flight panel shows "not built yet" until then |
| `/api/health` returns `{ok, mockChain, issuer, rpc}` | Refuse the live demo when the server is in practice-chain mode; a false flag alone is not proof of a verified Monad connection |

### Acceptance gates that involve P3
- **P3 implementation:** flow, uploads, recovery and automated UI checks work; no simulation path.
- **Live integration:** Grant, clean and injected examples run with real signing, real Monad and the live model; attempt-specific evidence is verified.
- **Published rehearsal:** the real self-test passes twice on the demo URL, followed by rehearsal and a backup recording of a genuine run.
- Offline UI fixtures are tests only, never a fallback demo.

## 5. Work items, in demo-priority order (cut from the bottom if late)

1. **Bouncer column** — 120 ms check stagger, stamp landing, BLOCKED card on top, ALLOWED margins table, REJECTED copy, errors as one sentence.
2. **Slip column** — full original card (For / Can see / Cannot see / Valid until / Signed / Stamped with time + block / public record link), amended card for scene 3, original dims to 60%.
3. **Report column** — hidden note invisible but in DOM; reveal cross-fade; "Atlas asks for" chips colored by decision, "forced" tag; scene 3 quote card.
4. **Public record** — chronological permission and request records, distinct provenance, genuine permission explorer links; no elapsed-time display.
5. **Header + control bar** — four ordered steps, request counter, disabled-reason tooltips, Reset “press again” confirm, keys 0–6 and R.
6. **Real-only demo** — no client simulation route; clearly fail when P1/P2 services are not ready.
7. **Pre-flight panel (`?preflight=1`)** — manual read-only health/state recheck; separately requested self-test, with side effects disclosed.
8. **Polish** — reduced motion, 1440×900 at 125% with no page scroll, jargon sweep of rendered text.
9. **Reliability** — bounded reads/actions, visible errors, no automatic write retry, uncertain-action recovery and repeatable browser tests.

## 6. Acceptance (P3 done)

- No query parameter activates simulated results.
- Without mock, every button calls its endpoint; errors show as one sentence.
- 1440×900 at 125%: no page scroll; stamp words ≥ 40px.
- Hidden note invisible until R or “Show hidden text”, still in DOM/extracted upload text.
- Two receipts → BLOCKED card on top.
- Optional dispute shows both slip cards and the server's decision; no fabricated timing explanation on RPC errors.
- Rendered text never contains mandate, gateway, digest, hash, EIP-712, nonce, transaction.
- Keys 0–6 and R work; reduced motion shows final states.
- No files changed outside P3 paths.
- Reset increments a generation and rejects writes from operations started in an earlier generation.
- Deployed as Reserved VM; demo URL loads; secrets present in the deployment.
