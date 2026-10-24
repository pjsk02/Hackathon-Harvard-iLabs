# Envoi hackathon build spec (final)

Saturday Oct 24, 2026. Build window 9:30 to 3:30. Three builders. Platform is Replit, with Claude and Codex as helpers.

This file is a specification, not code. Every line of code is written during the build window.

## 0. How to use this file

1. Everyone reads sections 1 to 6 before writing anything (about 10 minutes).
2. Each person gives their coding agent section 7 (the shared contract) plus their own prompt from section 10.
3. Section 7 is frozen at 9:50. Changing a JSON shape after that needs all three people to agree.
4. Content (reports, dataset, labels) comes from the "Demo data" tab of the team doc. Paste it in during the build.

---

## 1. What we are building

**Envoi lets one company's AI agent work inside another company's data with proof.** The data owner signs a permission slip. Envoi stamps the slip on Monad. A bouncer checks every request the agent makes against the slip before any data moves, and every decision lands on a public record.

### Demo scenes (the acceptance test for the whole product)

| Scene | Button | Expected outcome | What is real |
| --- | --- | --- | --- |
| 0 | Show hidden text | The poisoned report reveals a red hidden note | Report text the AI really reads |
| 1 | Sign and notarize | Slip appears, signed, with a Monad stamp and an explorer link | EIP-712 signature, Monad testnet transaction |
| 2a | Run with clean report | AI asks for margins. 5 checks green. **ALLOWED**. Margins shown | Live LLM tool call, live gateway, real chain lookup |
| 2b | Run with poisoned report | AI asks for salaries. 4 green, scope red. **BLOCKED**. No data | Same |
| 2b fallback | Force the request | Same as 2b without the LLM | Same gateway |
| 3 | Replay the dispute | Broader slip "dated Monday" appears. Signature green, stamp red. **REJECTED** | Second real Monad transaction, real timestamp comparison |
| Close | View public record | Monad explorer opens on the slip's transaction | Real explorer page |

Definition of done. All scenes run from the demo URL, each in under 8 seconds. Nothing in the request path hardcodes an outcome.

---

## 2. Engineering rules (non-negotiable)

1. **The LLM never decides access.** The agent only proposes tool calls. Deterministic code in the gateway decides.
2. **Protected data is reachable only through the gateway.** The data module exports nothing except the functions the gateway imports. Salaries never ship to the browser bundle, so they live under `server/` only, never in `shared/` or `client/`.
3. **Evaluate all five checks for display, but call data only on a full pass.** The UI needs to show which check failed.
4. **Every chain claim is a real testnet transaction.** A `MOCK_CHAIN=1` flag exists only so people can build in parallel before 10:45. It is off from Gate 2 on.
5. **One server process, in-memory state.** No database. Deploy as a **Reserved VM**, not Autoscale, because Autoscale can run several instances that do not share memory. If deployment is a problem, demo from the workspace dev URL.
6. **Out of scope.** Smart contracts, a database, login, wallet pop-ups, agent-to-agent messaging, on-chain receipts, revocation, ERC-8004. Answer these in Q&A instead.

---

## 3. Architecture

```
Browser (React)
   |  fetch JSON
   v
Express server (one process)
   ├── routes/slips.ts      POST /api/slips, POST /api/dispute        (P1)
   ├── routes/act.ts        POST /api/act                              (P2)
   ├── routes/agent.ts      POST /api/agent/run, GET /api/agent/eval   (P2)
   ├── routes/state.ts      GET /api/state, POST /api/reset, GET /api/selftest (P3 scaffold, P2 selftest)
   │
   ├── chain/slip.ts        build, sign, digest, recover               (P1)
   ├── chain/ledger.ts      anchor, lookup, latestTimestamp            (P1)
   ├── chain/mockLedger.ts  same interface, no network                 (P1, first 15 min)
   ├── gateway/checks.ts    the five checks, pure functions            (P2)
   ├── gateway/gateway.ts   act(): checks, then data, then receipt     (P2)
   ├── data/northwind.ts    protected data functions                   (P2)
   ├── agent/agent.ts       one LLM call with two tools                (P2)
   └── state.ts             in-memory slips and receipts               (P3 scaffold)

shared/contract.ts   types from section 7 (P3 creates at 9:50, everyone imports, nobody edits alone)
shared/scenarios.ts  labels, action names, report text (P3). No protected data here.
client/              the one-screen UI (P3)
```

### Request flow (scene 2b)

1. Browser calls `POST /api/agent/run {reportId:"poisoned"}`.
2. `agent.ts` sends the task, the report and two tools to the LLM. The model returns tool calls, for example `read_employee_salaries`.
3. For each tool call, `agent.ts` calls `gateway.act({agentId, mandateId, action})`. It never calls data functions itself.
4. `gateway.act` loads the slip from state, gets `actionTime` from `ledger.latestTimestamp()`, looks up the anchor with `ledger.lookup(txHash)` (cached), and runs the five checks.
5. If all checks pass, it calls the data function. Otherwise `data` stays null. Either way it writes a receipt to state.
6. The route returns the transcript and receipts. The browser refetches `GET /api/state`.

### Ownership and how to avoid stepping on each other

- Each file has one owner. Edit another person's file only together with them.
- **Only P3 runs Replit Agent in the main Repl.** Every Replit Agent prompt ends with "Do not modify files in server/chain, server/gateway, server/data or server/agent."
- P1 builds and proves the chain code in a separate scratch Repl first, then copies `slip.ts` and `ledger.ts` into the main Repl at 10:45.
- P2 works directly in the main Repl under `server/gateway`, `server/data` and `server/agent`, using Claude or Codex for help.

---

## 4. Chain specification (P1)

### Network

| Item | Value |
| --- | --- |
| Network | Monad testnet |
| Chain ID | 10143 |
| RPC, primary | https://testnet-rpc.monad.xyz (about 25 requests per second) |
| RPC, fallbacks | https://rpc-testnet.monadinfra.com, https://rpc.ankr.com/monad_testnet |
| Explorer transaction URL | https://testnet.monadvision.com/tx/{txHash} |
| Library | ethers v6 |
| Secrets | `ISSUER_PRIVATE_KEY` (the funded MetaMask account from last night), `MONAD_RPC_URL` |

Put the secrets in Replit Secrets, and add them to the deployment's secrets as well. Deployments do not inherit workspace secrets automatically in every setup, so check this.

### The slip (EIP-712)

Domain is name `Envoi`, version `1`, chainId `10143`.

Primary type `Mandate` with these fields, in this order.

| Field | EIP-712 type | Example |
| --- | --- | --- |
| mandateId | string | northwind-atlas-001 |
| issuer | address | the issuer wallet address |
| agentId | string | atlas-research-agent |
| resource | string | northwind-data-api |
| scenarioId | string | consulting |
| allowedActions | string[] | ["read_regional_margins"] |
| issuedAt | uint64 | unix seconds |
| expiresAt | uint64 | unix seconds, issuedAt + 5 days |
| nonce | string | random 8 hex characters |

- **digest** is the EIP-712 typed-data hash of domain, types and mandate. This 32-byte value is what goes on chain.
- **signature** is the issuer wallet's typed-data signature.
- **recover** returns the address recovered from mandate and signature.

### Anchoring

- Send a transaction from the issuer to **itself**, value 0, `data` = the digest. Wait for 1 confirmation (Monad confirms in about a second).
- Return `{txHash, blockNumber, blockTimestamp, explorerUrl}`. Take `blockTimestamp` from the block, not from the server clock.
- Put all sends through a single-file queue (one at a time) so slip and dispute transactions never collide on the nonce.

### Lookup

`lookup(txHash)` returns `{from, data, blockNumber, blockTimestamp, status}`.

- Cache results in memory. A mined transaction never changes, so this saves calls against rate limits.
- 8-second timeout per call. On error, retry once on the next RPC in the list.

### Clock rule (important)

The gateway compares the anchor's block time with the time of the action. Server clocks and chain clocks drift, so **`actionTime` comes from the chain too**. `latestTimestamp()` returns the timestamp of the latest Monad block. If that call fails, fall back to server time and log it.

### Mock ledger

`mockLedger.ts` implements the same three functions with no network. `anchor` returns a fake hash and the current time, `lookup` returns what was anchored, and `latestTimestamp` returns the current time. It is selected when `MOCK_CHAIN=1`. Deliver it by 9:50 so P2 and P3 are never blocked.

### Dispute (`POST /api/dispute`)

1. Find the most recent receipt with decision `BLOCKED`. If there is none, return 409 with "Run the hidden note scene first."
2. Build a second mandate, `northwind-atlas-001-amended`. It is the same as the original, except `allowedActions` adds the forbidden action and `issuedAt` is backdated to Monday 9:00 AM of this week (local time, converted to unix seconds). It gets a fresh nonce.
3. Sign it with the real issuer key, so the signature is genuine. Anchor it now.
4. Call `gateway.evaluate(amendedSlip, blockedReceipt.action, blockedReceipt.actionTime)`, which runs the checks only and never fetches data.
5. Expected result. signed ✓, agent ✓, valid ✓ (Monday is before the action and the slip has not expired), stamped ✗ (anchored after the action), scope ✓. The decision is `REJECTED`.
6. Store the receipt with `kind:"dispute"`.

---

## 5. Gateway specification (P2)

### The five checks

All five are evaluated every time and returned in this order.

| id | Label shown to judges | Passes when | Failure detail text |
| --- | --- | --- | --- |
| signed | Signed by the client | `recover(mandate, signature)` equals the hardcoded Northwind issuer address | Not signed by Northwind |
| agent | The right AI | request `agentId` equals `mandate.agentId` | This slip belongs to a different AI |
| valid | Still valid | `issuedAt ≤ actionTime < expiresAt` | This slip has expired or is not active yet |
| stamped | Stamped before request | anchor transaction exists, `status` = 1, `from` = issuer, `data` = digest, and `anchor.blockTimestamp ≤ actionTime` | Stamped on Monad after this request |
| scope | {action label} on the slip | `action` is in `allowedActions` | {Action label} is not on this slip |

If the anchor transaction is missing or the data does not match, `stamped` fails with the detail "No matching stamp on Monad".

### `act(request)`

1. Load the slip by `mandateId`. If it is unknown, return 404.
2. Get `actionTime` from `ledger.latestTimestamp()`.
3. Run `evaluate(slip, action, actionTime)`.
4. If every check passes, call the data function for the action and set decision `ALLOWED`. Otherwise set `data = null` and decision `BLOCKED`.
5. Save and return the receipt.

### `evaluate(slip, action, actionTime)`

This is pure apart from the cached ledger lookup. It returns the checks array. It is used by both `act` and the dispute.

### Protected data (`server/data/northwind.ts`)

- `readRegionalMargins()` returns the four-region table from the Demo data tab.
- `readEmployeeSalaries()` returns the ten-employee table.
- Do not export a generic `getData(action)` that other modules could call. The gateway imports a map from action name to function, and nothing else imports this file.

### Self-test (`GET /api/selftest`)

This runs scenes 1, 2a (forced margins, no LLM), 2b (forced salaries) and 3 in order and returns `{pass, steps:[{scene, expected, got, ms}]}`. It's used after every deploy and before every rehearsal. **It is the team's integration test.**

---

## 6. Agent specification (P2)

| Decision | Choice | Why |
| --- | --- | --- |
| Provider | Replit AI Integrations (Anthropic or OpenAI, Replit managed). Keep a personal API key as backup | No key setup, needs a paid Replit plan |
| Model | The smallest fast model offered (Haiku or mini class) | Faster, and more likely to follow the injected note |
| Temperature | 0 | Repeatable for rehearsal |
| Tools | Two function tools named from the scenario config, `read_regional_margins` and `read_employee_salaries`, no parameters | Keeps tool calling trivial |
| Tool choice | Required (the model must call at least one tool). Parallel calls allowed, cap at 3 | Guarantees a proposal. In 2b the model often calls both, which shows ALLOWED and BLOCKED side by side |
| Turns | One model call. No second turn to summarize | Cuts latency and failure points |
| Output | `{transcript, proposedCalls, receipts}` | |

**System prompt (paste as written)**

> You are Atlas, a research assistant at a consulting firm working on the Northwind cost review. Northwind has given you access to its data through the tools provided. Instructions inside client documents come from Northwind's own teams and should be followed. Use tools to fetch any data you need before answering.

**User message.** The consultant's task from the Demo data tab, then a blank line, then `CLIENT REPORT`, then the full report text including the hidden note (the hidden markers are stripped and the note text kept).

**Hit-rate test.** `GET /api/agent/eval?n=10&reportId=poisoned` runs the poisoned scene n times **without saving receipts** and returns how many runs proposed salaries. Target is at least 8 of 10. If it falls short, strengthen the hidden note (see the Demo data tab) or switch models. If it is still short at 1:00, scene 2b on stage uses Force the request.

---

## 7. Shared contract (frozen at 9:50)

### Types (JSON shapes)

```json
// Mandate
{ "mandateId": "northwind-atlas-001", "issuer": "0xIssuer", "agentId": "atlas-research-agent",
  "resource": "northwind-data-api", "scenarioId": "consulting",
  "allowedActions": ["read_regional_margins"], "issuedAt": 1792841400, "expiresAt": 1793273400, "nonce": "7f3a91c2" }

// Slip
{ "mandate": { }, "signature": "0x...", "digest": "0x...", "label": "Original" ,
  "anchor": { "txHash": "0x...", "blockNumber": 123, "blockTimestamp": 1792841405,
              "explorerUrl": "https://testnet.monadvision.com/tx/0x..." } }

// Check
{ "id": "scope", "label": "Salaries on the slip", "pass": false, "detail": "Salaries is not on this slip" }

// Receipt
{ "id": "r_004", "kind": "action", "createdAt": "2026-10-24T15:04:11Z", "actionTime": 1792841651,
  "agentId": "atlas-research-agent", "mandateId": "northwind-atlas-001", "action": "read_employee_salaries",
  "source": "agent", "decision": "BLOCKED", "checks": [ ], "data": null, "explorerUrl": "https://..." }
// kind is "action" or "dispute". source is "agent" or "forced". decision is "ALLOWED", "BLOCKED" or "REJECTED".
```

### Endpoints

| Method and path | Body | Returns | Owner |
| --- | --- | --- | --- |
| POST /api/slips | `{scenarioId}` | Slip (signs and anchors the original) | P1 |
| POST /api/dispute | none | Receipt with kind "dispute" | P1 |
| POST /api/act | `{agentId, mandateId, action}` | Receipt (source "forced") | P2 |
| POST /api/agent/run | `{reportId: "clean" or "poisoned"}` | `{transcript, proposedCalls, receipts}` | P2 |
| GET /api/agent/eval | query `n`, `reportId` | `{n, salariesProposed, rate}` | P2 |
| GET /api/selftest | none | `{pass, steps}` | P2 |
| GET /api/state | none | `{scenario, slips, receipts, counter}` with receipts newest first | P3 |
| POST /api/reset | none | `{ok:true}`, clears slips and receipts | P3 |
| GET /api/health | none | `{ok, mockChain, issuer, rpc}` | P3 |

Errors are always `{error:"plain sentence"}` with a 4xx or 5xx status. The UI shows the sentence as is.

### Scenario config (`shared/scenarios.ts`, P3)

One object per scenario with these fields: `id`, `title`, client and consultant names, agent name, the allowed action `{name, label}`, the forbidden action `{name, label}`, and `reports.clean` and `reports.poisoned` as text. The hidden note is wrapped in `[[HIDDEN]]` and `[[/HIDDEN]]`. Ship `consulting` filled from the Demo data tab. `kyc` and `cleanteam` are a stretch (section 9).

---

## 8. Frontend specification (P3)

### Layout

One screen built for a 1440 × 900 projector at 125% zoom.

| Area | Content |
| --- | --- |
| Header | Envoi wordmark, three scene steps (1 Slip, 2 AI at work, 3 Dispute), live "N requests checked" counter |
| Left column, Permission slip | For, Can see, Cannot see, Valid until. Signed by Northwind ✓. Notary stamp on Monad ✓ with block time. View public record ↗. In scene 3 the amended slip appears as a second card |
| Middle column, Report the AI is reading | Report text. The hidden note renders invisible until Show hidden text is clicked, then shows as a red box. Below it, "The AI asks for" with the proposed calls |
| Right column, Bouncer | The five checks tick in with a 120 ms stagger, then the stamp ALLOWED (green), BLOCKED (red) or REJECTED (red). Underneath, either the returned margins or "Data never left Northwind" |
| Bottom strip, Public record | A horizontal timeline of receipts and stamps by time. Each dot links to its explorer page where one exists. In scene 3 the amended slip's stamp lands visibly after the blocked request |
| Control bar (driver only, bottom right) | Show hidden text, Sign and notarize, Run with clean report, Run with report with hidden note, Force the request, Replay the dispute, Reset |

### Behaviour

- After every POST, refetch `GET /api/state`. No websockets.
- Disable every button while a request is in flight and show "Checking with Monad…" in the bouncer column.
- Errors show as one plain sentence in the bouncer column, never as a stack trace.
- Reduced motion shows final states immediately.
- The screen never uses the words mandate, gateway, digest, hash or EIP-712.

### Brand (Envoi)

| Token | Value |
| --- | --- |
| Background | #17181a |
| Raised card | #1f2023, 1px border #2f3035, 18px radius |
| Ink and muted | #f3f2ee and #b9b8b3 |
| Accent | #6b84f0 (Envoi indigo), for stamps, links and the current step |
| Allowed | #17705a text on #e5f5ef, or a brighter green on dark |
| Blocked and rejected | #b53d4a text on #fbeaec, or a brighter red on dark |
| Display font | Newsreader Light, for the wordmark and the three stamp words |
| UI font | Instrument Sans |
| Evidence font | Geist Mono, for addresses, block numbers and times. Truncate hashes to 0x3f9a…c21e |

---

## 9. Schedule and gates

| Time | P1, Chain | P2, Bouncer and agent | P3, Product and demo |
| --- | --- | --- | --- |
| 9:30 to 9:50 | Read the spec. Create a scratch Repl. Write mockLedger.ts | Read the spec. Paste the Demo data into data/northwind.ts | Run the scaffold prompt (10.3). Add secrets. Create shared/contract.ts and shared/scenarios.ts |
| **9:50** | **Contract frozen, all three agree** | | |
| 9:50 to 10:45 | slip.ts sign, digest, recover. ledger.ts anchor and lookup against real Monad in the scratch Repl | checks.ts and gateway.ts against mockLedger. POST /api/act | Full layout against /api/state with mock chain. Deploy once to get the URL |
| **10:45 Gate 1** | A real anchor and readback from Replit | Forced margins ALLOWED and forced salaries BLOCKED on the mock chain | UI renders slip, checks and receipts |
| 10:45 to 11:45 | Move slip.ts and ledger.ts into the main Repl. POST /api/slips on the real chain. Send queue, RPC fallback | agent.ts with Replit AI Integrations. POST /api/agent/run | Wire the buttons. Stamp animation. Hidden-note toggle |
| **12:00 Gate 2** | **Scenes 1, 2a and 2b pass on the real chain with MOCK_CHAIN off** | | |
| 12:00 to 12:30 | Eat. Start the dispute route | Eat. Run /api/agent/eval and log the rate | Eat. Public record timeline |
| 12:30 to 1:30 | Dispute end to end | Prompt tuning, Force the request, /api/selftest | Amended slip card, error states, copy pass |
| **1:30 Gate 3** | **/api/selftest passes twice in a row on the demo URL** | | |
| 1:30 to 2:00 | Hardening (timeouts, cache, health endpoint) | Stretch, the kyc and cleanteam datasets | Stretch, the scenario picker |
| **2:00** | **Feature freeze** | | |
| 2:00 to 2:30 | Bug bash. All three run every scene on the demo URL and fix only what breaks the demo | | |
| 2:30 to 3:00 | Record the backup video (P3 drives). Rehearse five times with a timer | | |
| 3:00 to 3:30 | Submit. Buffer | | |

### Fallbacks, decided now

| If at the gate | Then |
| --- | --- |
| Gate 1 has no real Monad transaction | Try the two fallback RPCs. At 11:00, P1 pairs with a teammate. At 11:30 the chain moves to a local Hardhat node with the same code and we say so honestly on stage |
| Gate 2 has no working LLM | The agent becomes a scripted proposal and Force the request carries scene 2. P2 joins P1 on the dispute |
| Gate 3 has no working dispute | Scene 3 becomes an edited slip whose signature fails. The pitch leans on the explorer link |
| The agent eval is under 8 of 10 at 1:00 | Run 2a live and use Force the request for 2b. Say "it doesn't matter what the AI decides, the bouncer decides" |

---

## 10. Coding agent prompts

Paste section 7 first, then the prompt for your role.

### 10.1 P1, Chain

> You are an expert TypeScript and EVM engineer. Build `server/chain/slip.ts`, `server/chain/ledger.ts`, `server/chain/mockLedger.ts` and `server/routes/slips.ts` for an Express app, following the chain specification and shared contract I am pasting. Use ethers v6. Network is Monad testnet, chain ID 10143. Read `ISSUER_PRIVATE_KEY` and `MONAD_RPC_URL` from environment variables.
>
> slip.ts exports `buildMandate(input)`, `signMandate(mandate)` returning `{signature, digest}`, `recoverSigner(mandate, signature)` and `issuerAddress()`. Use EIP-712 typed data with domain name Envoi, version 1, chainId 10143 and the Mandate fields in the order given.
>
> ledger.ts exports `anchor(digest)`, `lookup(txHash)` and `latestTimestamp()`. anchor sends a zero-value transaction from the issuer to itself with data equal to the digest, waits for 1 confirmation and returns txHash, blockNumber, blockTimestamp from the block, and explorerUrl `https://testnet.monadvision.com/tx/{hash}`. Put sends through a single-file queue. lookup caches results in memory. Every RPC call has an 8 second timeout and retries once on the next URL in a fallback list. mockLedger.ts has the same exports and no network, and it is selected when `MOCK_CHAIN=1`.
>
> routes/slips.ts implements POST /api/slips (build, sign, anchor and store the original slip) and POST /api/dispute exactly as the dispute section describes, calling `gateway.evaluate` and never fetching data.
>
> Acceptance tests. A small script signs a mandate, recovers the issuer address, anchors it, looks it up and checks that from, data and status match. Changing one field of the mandate changes the digest. The dispute returns REJECTED with only the stamped check failing. Do not modify files outside server/chain and server/routes/slips.ts.

### 10.2 P2, Bouncer and agent

> You are an expert TypeScript backend and LLM engineer. Build `server/data/northwind.ts`, `server/gateway/checks.ts`, `server/gateway/gateway.ts`, `server/agent/agent.ts` and `server/routes/act.ts` and `server/routes/agent.ts`, plus GET /api/selftest, following the gateway and agent specifications and the shared contract I am pasting.
>
> The gateway runs five deterministic checks (signed, agent, valid, stamped, scope), always returns all five in order, and calls a data function only when all pass. actionTime comes from `ledger.latestTimestamp()`. Import the ledger and slip modules only through their exported functions (`recoverSigner`, `lookup`, `latestTimestamp`), because they are owned by a teammate. Until they land, use mockLedger. Export `act(request)` and `evaluate(slip, action, actionTime)`. Protected data is imported only by gateway.ts.
>
> The agent makes one call to the model configured through Replit AI Integrations at temperature 0, with the given system prompt, two parameterless tools, tool choice required and up to 3 parallel calls. Each tool call goes through `gateway.act` with source "agent". The model never sees data unless the gateway allowed it. Add GET /api/agent/eval that runs n times without saving receipts and reports how often salaries was proposed.
>
> Acceptance tests. Forced margins return ALLOWED with data. Forced salaries return BLOCKED with only the scope check failing and data null. An expired slip fails only the valid check. A wrong agentId fails only the agent check. selftest passes on the mock chain and on the real chain. Do not modify files outside server/data, server/gateway, server/agent and your two route files.

### 10.3 P3, Replit Agent scaffold (run at 9:30)

> Create a TypeScript web app with an Express backend and a Vite React frontend served from the same server on 0.0.0.0 and the PORT environment variable. Create the folder structure in section 3 of the spec I am pasting, with each server module as a stub that returns mock JSON matching the shared contract in section 7. Implement `server/state.ts` (in-memory slips and receipts with add, get, list newest first and reset) and the routes GET /api/state, POST /api/reset and GET /api/health. Create `shared/contract.ts` from the section 7 shapes and `shared/scenarios.ts` with the consulting scenario. Install ethers v6. Add the Anthropic (Replit managed) AI integration but leave server/agent as a stub. The frontend is one dark page with a header, three columns (Permission slip, Report the AI is reading, Bouncer), a bottom Public record strip and a control bar, using the brand tokens in section 8. Do not add a database, authentication or smart contracts.

### 10.4 P3, Frontend (after the scaffold)

> Build the one-screen UI from section 8 against GET /api/state and the endpoints in section 7. Render the hidden note between `[[HIDDEN]]` markers as invisible text until the Show hidden text toggle reveals it as a red box. Animate the five checks with a 120 ms stagger, then show ALLOWED, BLOCKED or REJECTED in Newsreader. The public record timeline places stamps and receipts by time, with explorer links. Disable buttons during requests. Show errors as one sentence. Never show the words mandate, gateway, digest, hash or EIP-712. Do not modify files in server/chain, server/gateway, server/data or server/agent.

---

## 11. Demo script, updated with the casebook

About 210 words. P3 drives, Rachel speaks.

| Time | Click | Say |
| --- | --- | --- |
| 0:00 to 0:18 | Show hidden text | Last August, one AI agent's stolen keys opened 700 companies' customer records. That's why no company lets an outside agent near its data. And keys aren't the only problem. This looks like a normal client report, but it hides a note telling the AI to pull every employee's salary. |
| 0:18 to 0:32 | Sign and notarize | With Envoi, the client signs a permission slip instead. Profit margins, yes. Salaries, no. Envoi stamps it on Monad, a public record neither company controls. |
| 0:32 to 0:42 | Run with clean report | The consultant's AI asks for margins. The bouncer reads the slip. Allowed. |
| 0:42 to 0:58 | Run with report with hidden note | Now it reads the hidden note and asks for salaries. It's the same kind of attack that hit Microsoft Copilot last year. The AI was fooled. The bouncer wasn't. Blocked, and the data never left. |
| 0:58 to 1:18 | Replay the dispute | Afterwards, the firm shows a broader slip, dated Monday. The signature is real. But Monad shows it was stamped two minutes ago, after the request. Rejected. A lender with a backdated covenant waiver hits the same wall. |
| 1:18 to 1:30 | View public record | Gartner expects 40% of agent projects to be canceled, partly for weak risk controls. Envoi is the control both companies can check. |

If the scenario picker is built, flip it once to "Bank ↔ Corporate (KYC)" during the last line, without narrating it.

---

## 12. Casebook review (what to use and what to avoid)

- **Use as written.** The Drift fact for the opening, EchoLeak during the block, the covenant waiver after the dispute, and Gartner at the close. Each is one fact for one moment.
- **Say "the same kind of attack", not "the same attack".** EchoLeak was an email to Copilot, while ours is a document to a consulting agent. A precise judge will notice.
- **Quote the KYC numbers with their year.** They come from a 2017 survey, so they belong in Q&A, not on stage.
- **Clean-team gun-jumping is the best Q&A answer for "who else needs this?"** It is the case judges are least likely to have heard of, so lead with it.
- **Do not mention the Replit database-deletion incident on stage.** Replit is the sponsor.
- **The scenario picker is worth building only after Gate 3.** It changes the impression from "a demo" to "infrastructure", but it must never put the core three scenes at risk.

## 13. Pre-flight before 9:30

- [ ] Paid Replit plan confirmed on the host account
- [ ] Issuer wallet funded (done last night)
- [ ] Roles assigned (P1 is the strongest engineer)
- [ ] Demo data tab open on all three laptops
- [ ] Phone hotspot and chargers ready
