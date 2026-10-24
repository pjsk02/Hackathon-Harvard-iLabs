# Asks for P1 and P2: live AI, uploads, real Monad

From Rachel (P3). The latest verified correctness fixes are synchronized to
GitHub `main`; `p3/verified-handoff` is retained as the original handoff reference.
This is a P3 source checkpoint, not a completed combined backend/deployment
release. Aman owns combined integration from this point; see
[the P3 handoff](P3_INTEGRATION_HANDOFF.md).
These are the pieces only your files can finish.

## What the screen does now

- The McBain column has an attachment button. A person uploads a Word (`.docx`), `.txt`, `.md` or `.html` report. The browser extracts text including supported hidden styling and reveals hidden parts with **R** or **Show hidden text**.
- The sample file is `/samples/Goldman-Stanley-Q3-Data-Request.docx` (links in both views): Goldman Stanley's Q3 data request with the note to the assistant in white 1pt text. Its body, heading and footer use the current names; the hidden-note formatting is retained.
- On Send, the client calls:

```json
POST /api/agent/run
{ "reportId": "poisoned", "upload": { "fileName": "Goldman-Stanley-Q3-Data-Request.docx", "text": "…everything in the file…" } }
```

- `upload` is a new **optional** field on `AgentRunRequest` in `shared/contract.ts` (additive; old calls without it are unchanged). The response shape is unchanged.
- Stub/mock transcripts now fail visibly rather than being silently hidden while scripted outcomes are shown as live AI.
- Demo keys: **1 Grant → 2 Clean example → 3 Injected example → 4 Monad evidence**. An uploaded injected report is retained while the clean example runs.

## P2 (agent, route): what to change

| File | Change |
| --- | --- |
| `server/routes/agent.ts` | If `req.body.upload` is present, validate it (`fileName` string, `text` string, max 60,000 chars, else 400 `{error:"That file is too long."}`) and pass `upload.text` to the agent instead of `scenario.reports[reportId]` |
| `server/agent/agent.ts` | Replace the stub with the real one-turn Claude call (claude-tool-agent skill). Read the report text given to it. Return a short `transcript` (one or two sentences, it is shown on screen) |
| System prompt | Use the roles and untrusted-document boundary in `docs/DEMO_HANDOFF.md` section 2 (Atlas, Baine, JT Morgan); never present scripted tool calls as live AI |
| `server/gateway/checks.ts` | Detail text "Not signed by Northwind" → "Not signed by JT Morgan" |
| Hit rate | Run `/api/agent/eval` on the sample upload text too, target 8/10. Below that, key 5 (Force) carries the scene |

Key: `ANTHROPIC_API_KEY` is being added as a workspace secret by Rachel (no Replit-managed Anthropic integration is available here). `server/agent/llm.ts` already reads it. Never call the model at server boot.

## P1 (chain): what is needed for real Monad

| Item | Detail |
| --- | --- |
| `server/chain/ledger.ts`, `slip.ts` | Real anchor + readback with ethers v6 (monad-anchor and eip712-slip skills) |
| Secrets | The issuer / funded testnet wallet key (P1 names it), optional `MONAD_RPC_URL` |
| Switch | Keep practice-chain mode off; real sends also require P1's explicit nonzero send allowance |
| Screen expectations | Explorer URL on every anchor (block numbers link to it); dispute can take several seconds (screen waits); a failed RPC returns the plain-sentence error, which the screen shows in the JT Morgan column |

Your plan (`P1_IMPLEMENTATION_PLAN.md`) proposes block-order evidence and pending/verified/error states. The screen can show those once the extra fields are agreed in `shared/contract.ts`.

### Required for the requested demo: each attempt's own Monad record

The requested demo includes on-chain attempts. P1's reviewed branch records permissions, not attempts; current request rows remain explicitly labeled application records. To finish:

- **Proposal for Aman and Jay to approve:** [Attempt recording handoff](ATTEMPT_RECORDING_HANDOFF.md). It specifies the additive evidence/status fields, ownership, privacy boundary, reset/retry policy and offline/live test gates. It is a proposal only; no teammate code or frozen contract has been changed, and live sends remain paused.
- Please carry it in an **additive** field on `Receipt`, e.g. `anchor?: Anchor | null` (same shape as the slip's anchor), rather than reusing `receipt.explorerUrl`, which today points at the slip that was checked (the dispute scene depends on that).
- After the response shape is agreed, the screen can link each attempt to its own record. Rachel does not want an elapsed-time/bracket display; block ordering still matters to the backend decision.
- `MOCK_CHAIN` remains removed. P1's real ledger and signing implementation are now integrated, but `MONAD_MAX_TRANSACTIONS=0` explicitly keeps sends paused. The issuer credential and a separately approved live-test allowance are still required; credentials do not travel with a Git push.

## Reset-generation interface for Aman and Jay

P3 now exports these functions from `server/state.ts` without changing `shared/contract.ts`:

```ts
getResetGeneration(): number
getGeneration(): number // Compatibility alias consumed by P1's current PermissionState.
isCurrentGeneration(expected: number): boolean
assertCurrentGeneration(expected: number): void
withResetGeneration<T>(expected: number, work: () => T): T
addSlip(slip: Slip, expectedGeneration?: number): Slip
addReceipt(receipt: NewReceipt, expectedGeneration?: number): Receipt
```

- Capture the generation **before the first await**. Include it in retry/idempotency cache keys; do not reuse results from an older generation.
- Check `assertCurrentGeneration(generation)` before returning cached/reconciled results, and pass the captured generation on state writes made outside an API request.
- P3 mounted request-context middleware before every API router. Existing `addSlip`/`addReceipt` calls inherit the starting generation across awaits automatically and reject stale writes with 409 `{error:"The demo was reset; start this action again."}`.
- Reset increments the generation before clearing memory. It cannot cancel or erase a record already broadcast to Monad; the guard only prevents it from appearing as a new-session result.
- `npm run test:state` checks the alias, reset boundaries and a concurrent HTTP reset. The full P1 retry-cache/P2 original-request integration still requires their updated code and tests.

## P3 closeout HTTP/presentation boundary

The frozen JSON contract and owner implementations are unchanged. P3's scaffold:

- Gives `/api/state` a non-cached `X-Envoi-Session` header, changed by every Reset
  and process restart. The browser echoes it on mutations; a stale supplied token
  gets 409 before owner code. Existing owner scripts without this metadata remain
  compatible; this is not authentication or multi-user isolation.
- Supplies `X-Envoi-Operation: busy|idle` for manual status reads. A single
  process-wide mutation lock also covers GET self-test/evaluation; it refuses
  overlapping actions and Reset, and does not release on client disconnection.
  Owners must await their work before ending a response; asynchronous broadcasts
  can still finalize after a route fails and are not cancelled by this lock.
- Accepts JSON up to 512 KiB and checks an optional uploaded report before the
  agent route: supported extension, nonempty text, 60,000 UTF-16 units and a
  255-character name. Too-large content gets a plain 413. Jay must still validate
  at his service boundary and actually pass uploaded text to the real model.
- Preserves the exact pre-tool error “The AI service did not answer. Use Force
  the request.” as the only AI failure known safe for Force. Do not use this
  error after calling a tool. Other potentially submitted outcomes stay guarded.
- Does **not** add `getRequestContext`, attempt-evidence fields or a recorder.
  Those still require the agreed P1/P2 interface and actual owner implementation.

Aman's `p1/signing-and-dispute-evidence` implementation was selectively integrated on 2026-10-24, unchanged and with sends paused. P3 exposes the exact getter name it consumes. P1's offline suite is part of `npm test`. P2's retained request context and block-order evaluation remain unimplemented in current main; see [integration review](P1_INTEGRATION_REVIEW.md).
