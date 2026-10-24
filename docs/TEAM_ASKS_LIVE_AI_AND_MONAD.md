# Asks for P1 and P2: live AI, uploads, real Monad

From Rachel (P3). The screen side is done and pushed. These are the pieces only your files can finish.

## What the screen does now

- The Baine column has an attachment button. A person uploads a Word (`.docx`), `.txt`, `.md` or `.html` report. The browser extracts text including supported hidden styling and reveals hidden parts with **R** or **Show hidden text**.
- The demo file is `/samples/JT-Morgan-Q3-Data-Request.docx` (link under the chat box): JT Morgan's Q3 data request with the note to the assistant in white 1pt text.
- On Send, the client calls:

```json
POST /api/agent/run
{ "reportId": "poisoned", "upload": { "fileName": "JT-Morgan-Q3-Data-Request.docx", "text": "…everything in the file…" } }
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

Aman's `p1/signing-and-dispute-evidence` implementation was selectively integrated on 2026-10-24, unchanged and with sends paused. P3 exposes the exact getter name it consumes. P1's offline suite is part of `npm test`. P2's retained request context and block-order evaluation remain unimplemented in current main; see [integration review](P1_INTEGRATION_REVIEW.md).
