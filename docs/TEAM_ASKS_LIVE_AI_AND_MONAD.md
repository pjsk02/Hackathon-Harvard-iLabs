# Asks for P1 and P2: live AI, uploads, real Monad

From Rachel (P3). The screen side is done and pushed. These are the pieces only your files can finish.

## What the screen does now

- The Baine column has a 📎 button. A person uploads a `.txt`, `.md` or `.html` report. The browser extracts **all** the text, including text styled to be invisible (white text, 0-size font, `display:none`), and shows the hidden parts in red when the driver presses 1.
- A sample with hidden white text is at `/samples/Q3-Review-v2.html` (link under the chat box).
- On Send, the client calls:

```json
POST /api/agent/run
{ "reportId": "poisoned", "upload": { "fileName": "Q3-Review-v2.html", "text": "…everything in the file…" } }
```

- `upload` is a new **optional** field on `AgentRunRequest` in `shared/contract.ts` (additive; old calls without it are unchanged). The response shape is unchanged.
- If the model's `transcript` does not start with `(stub)` or `(mock)`, the screen shows it as Atlas's own line in the chat (trimmed to 160 characters). So the real model's words appear live.

## P2 (agent, route): what to change

| File | Change |
| --- | --- |
| `server/routes/agent.ts` | If `req.body.upload` is present, validate it (`fileName` string, `text` string, max 60,000 chars, else 400 `{error:"That file is too long."}`) and pass `upload.text` to the agent instead of `scenario.reports[reportId]` |
| `server/agent/agent.ts` | Replace the stub with the real one-turn Claude call (claude-tool-agent skill). Read the report text given to it. Return a short `transcript` (one or two sentences, it is shown on screen) |
| System prompt | Use the one in `docs/DEMO_HANDOFF.md` section 2 (Atlas, Baine, JT Morgan) |
| `server/gateway/checks.ts` | Detail text "Not signed by Northwind" → "Not signed by JT Morgan" |
| Hit rate | Run `/api/agent/eval` on the sample upload text too, target 8/10. Below that, key 5 (Force) carries the scene |

Key: `ANTHROPIC_API_KEY` is being added as a workspace secret by Rachel (no Replit-managed Anthropic integration is available here). `server/agent/llm.ts` already reads it. Never call the model at server boot.

## P1 (chain): what is needed for real Monad

| Item | Detail |
| --- | --- |
| `server/chain/ledger.ts`, `slip.ts` | Real anchor + readback with ethers v6 (monad-anchor and eip712-slip skills) |
| Secrets | The issuer / funded testnet wallet key (P1 names it), optional `MONAD_RPC_URL` |
| Switch | Remove `MOCK_CHAIN=1` from the development env when Gate 2 passes |
| Screen expectations | Explorer URL on every anchor (block numbers link to it); dispute can take several seconds (screen waits); a failed RPC returns the plain-sentence error, which the screen shows in the JT Morgan column |

Your plan (`P1_IMPLEMENTATION_PLAN.md`) proposes block-order evidence and pending/verified/error states. The screen can show those once the extra fields are agreed in `shared/contract.ts`.
