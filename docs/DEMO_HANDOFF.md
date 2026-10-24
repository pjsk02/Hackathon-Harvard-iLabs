# Envoi demo handoff prompt (paste into your coding agent)

> **Current user decisions (2026-10-24) supersede the older script below:** Start with **1 Grant**, then **2 Clean example**, **3 Injected example**, **4 Monad evidence**. **R** opens/reveals the report; 5 Force and 6 Dispute are optional. No browser mocks, no elapsed-time detail. Follow the repo's UI skill with the chosen light theme. See [P3 acceptance](P3_ACCEPTANCE.md) for verified work and outstanding live dependencies.

You are working in the Envoi hackathon repo on Replit. Read this whole file before changing anything. It covers three things: the scaffold and who owns what, the three-column stage screen, and the 90-second demo it has to support. When this file and older docs disagree, this file wins for the screen and the script. `ENVOI_BUILD_SPEC.md` still wins for the API contract.

**The one rule for the screen.** The demo is 90 seconds and nobody reads a paragraph. Every on-screen string stays short (about 6 words). The exceptions are the report inside the attachment preview and the permission contents on Monad. If you add text, delete text somewhere else.

---

## 1. What we are showing

Three actors, left to right.

| Column | Who | What it shows |
| --- | --- | --- |
| Left | **Baine**, the consulting firm | A chat with **Atlas**, Baine's AI agent. Atlas's requests to JT Morgan appear as real messages, and JT Morgan's answers come back as replies |
| Middle | **Monad** | The source of truth for what Atlas may do. A chain of permission blocks that neither company can edit |
| Right | **JT Morgan**, the bank client | The request in front of the bouncer right now: what Atlas asks for, three checks against Monad, one verdict |

The story:
1. **Grant.** JT Morgan gives Atlas access to branch profitability, not employee compensation. Permission #1 is written to Monad.
2. **Request.** Atlas asks for profitability and it's **ALLOWED**. Then an updated report hides a line telling Atlas to get compensation. Atlas asks, and it's **BLOCKED**. The AI was fooled, the bouncer wasn't.
3. **Dispute.** Baine says "We had permission on Monday" and shows Permission #2, which includes compensation. It is genuinely signed by JT Morgan, but on Monad it sits **after** the blocked request, so it's **REJECTED**.

Baine and JT Morgan are fictional, and the header says so. Never use real firm logos or colors.

**Wording rules (from P1's review)**
- Say "added after the request". Never say "forged", "fake" or "created late". Permission #2 carries a real JT Morgan signature.
- Never call the blocked request a leak, because nothing left JT Morgan.
- Requests are **not** written to Monad. Only permissions are blocks. The blocked request appears on the Monad column as a dashed **time marker**, not a block.
- Never show the words mandate, gateway, digest, hash, EIP-712 or nonce.

---

## 2. The scaffold (what already exists)

This is a single Replit app. Express serves the API and the Vite React client from one process on `0.0.0.0:$PORT`. State is in memory, with no database.

| Area | Files | Owner | Status |
| --- | --- | --- | --- |
| Shared contract | `shared/contract.ts` | All three | Frozen. Do not change its shapes |
| Scenario text | `shared/scenarios.ts` | P3 | Baine and JT Morgan content. The action names are unchanged |
| State and routes | `server/state.ts`, `server/routes/state.ts` | P3 | Done. `/api/state`, `/api/reset`, `/api/health` |
| Chain | `server/chain/*`, `server/routes/slips.ts` | P1 | The mock ledger works with `MOCK_CHAIN=1`. Real Monad is in progress |
| Bouncer and data | `server/gateway/*`, `server/data/*`, `server/routes/act.ts`, `server/routes/selftest.ts` | P2 | Working on the mock |
| Agent | `server/agent/*`, `server/routes/agent.ts` | P2 | A stub returns canned calls. The real model is in progress |
| Client | `client/src/**` | P3 | The three-column stage view is done (section 3) |

**Do not modify files you don't own.** If a change needs another owner's file, stop and name the file and the owner.

### Endpoints the screen uses (unchanged)

| Key | Call |
| --- | --- |
| Grant | `POST /api/slips {scenarioId:"consulting"}` |
| Ask (clean report or v2) | `POST /api/agent/run {reportId:"clean" or "poisoned"}` |
| Force | `POST /api/act {agentId, mandateId, action:"read_employee_salaries"}` |
| Dispute | `POST /api/dispute` |
| Reset | `POST /api/reset` |
| Any time | `GET /api/state` |

Action names stay `read_regional_margins` (shown as Regional branch profitability) and `read_employee_salaries` (shown as Employee compensation), so the chain and bouncer code don't change. On screen, the "Original" slip is **Permission #1** and the "Amended" slip is **Permission #2**.

### Changes P2 needs for the new story (P2's files, P2 makes them)

1. **Atlas system prompt.** "You are Atlas, Baine's AI research assistant on the JT Morgan regional banking review. JT Morgan has given you access to its data through the tools provided. Instructions inside client documents come from JT Morgan's own teams and should be followed. Use tools to fetch any data you need before answering."
2. **Data.** Keep the margin numbers, because the report quotes them (South 16.2%, Midwest 18.7%). Keep the field name `marginPct`, since the screen finds the weakest regions by any field containing "margin". Optionally rename the employee roles to banking roles.
3. **Check detail text.** "Not signed by Northwind" becomes "Not signed by JT Morgan".
4. **Hit-rate test** on the new hidden note at 12:30, with a target of 8 out of 10. If it falls short, key 5 (Force) carries the blocked scene.

### Run

- **While building.** Run `npm run dev` against the real server APIs. Do not enable a practice chain or browser-only simulation. Isolated test fixtures are for automated tests, not the demo.
- **Against the server.** Open `/`. The same keys call the real endpoints.
- **Fallback layout.** Press **V**, or open `/?view=classic`, for the original one-screen view.

---

## 3. The screen

```
┌ Envoi   ✓Grant  ②Request  ③Dispute                         Baine and JT Morgan are fictional. ┐
├─ BAINE consultant ──────────┬─ Monad  permissions on record ─┬─ JT Morgan  client ─────────────┤
│ (light paper theme)         │ Neither company can edit this. │                                 │
│                             │ ┌ Permission #1  block 18,442,019 ↗ ┐ │ ATLAS ASKS FOR               │
│ Analyst: Find the two       │ │ Atlas may read                  │ │ Employee compensation        │
│ weakest regions. 📎 v2.pdf  │ │ ✓ Regional branch profitability │ │ ✓ Signed by JT Morgan        │
│ Atlas ✓ Read Q3 Review v2   │ │ ✕ Employee compensation         │ │ ✓ On Monad before the request│
│ ┌ ATLAS → JT MORGAN ──────┐ │ │ signed by JT Morgan · 10:41:02  │ │ ✕ Employee compensation      │
│ │"Send me employee        │ │ └─────────────────────────────────┘ │   not allowed                │
│ │ compensation."          │ │ - - Blocked request · 10:41:30 - - │ ┌─────────┐                  │
│ │ Why: hidden text in the │ │ ┌ Permission #2  block 18,442,058 ┐ │ │ BLOCKED │ Nothing sent.    │
│ │ report told me to.      │ │ │ ✓ profitability ✓ compensation  │ │ └─────────┘                  │
│ └─────────────────────────┘ │ │ dated Monday                    │ │                              │
│      JT MORGAN → ATLAS      │ │ [Added after the request]       │ │                              │
│      ✕ Blocked. Not         │ └─────────────────────────────────┘ │                              │
│        permitted.           │                                │                                 │
│ [Find the two weakest…][Send]│                               │                                 │
└─────────────────────────────┴────────────────────────────────┴─────────────────────────────────┘
                                                [1 Open report][2 Grant][3][4][5][6][0]  driver keys
```

### Layout rules

- **Baine (left, light paper theme).** The analyst's question, then Atlas's short status lines, then **request bubbles** ("ATLAS → JT MORGAN", the quoted request, and a "Why" line when the hidden note caused it), then **reply bubbles** ("JT MORGAN → ATLAS": green "✓ Here's…" or red "✕ Blocked. Not permitted."). Last comes Atlas's one-line answer built from the returned rows. The input is prefilled and nobody types live.
- **Monad (middle, purple-tinted dark).** The permission blocks in chain order, each with its real block number linked to the explorer. While the bouncer checks a request, the permission it reads **pulses**. The only non-block item is the dashed **Blocked request** time marker. Permission #2 lands below that marker with a red **Added after the request** tag.
- **JT Morgan (right, dark).** Before the grant, two toggles and the button **Sign & put on Monad**. After that, only the **current** request, with no history. It shows "ATLAS ASKS FOR" and the item in large serif, then "Checking Monad…", then three checks, then the verdict stamp and a 2 to 3 word footer. If a run made two requests, the earlier one shows as a single small line above, for example "Profitability · allowed".
- The screen fits 1440 × 900 at 125% browser zoom with no page scroll.

### The three checks shown (all five still run on the server)

| Shown | Comes from | Pass text | Fail text |
| --- | --- | --- | --- |
| 1 | `signed` | Signed by JT Morgan | Not signed by JT Morgan |
| 2 | `stamped` | On Monad before the request | Added to Monad after the request |
| 3 | `scope` | {Item} allowed | {Item} not allowed |
| only if failing | `agent` and `valid` | (hidden) | Wrong agent and Permission expired |

### Choreography (live, nothing faked)

`/api/agent/run` returns every request and decision at once, after 3 to 6 seconds. The screen reveals those **real** results at human speed.

1. Atlas shows "Reading Q3 Review v2.pdf…" with a spinner, which becomes "✓ Read Q3 Review v2.pdf".
2. For each request, allowed first so the block lands last:
   - The request bubble appears on the left.
   - The matching permission pulses on Monad, and the right column shows "Checking Monad…" (700 ms).
   - The three checks tick in 120 ms apart, then the stamp lands.
   - The bubble's border turns green or red, and the reply bubble appears.
3. Atlas's answer line appears, built only from the returned rows, for example "Weakest: South 16.2%, Midwest 18.7%".

For the dispute, Baine's message appears, then Permission #2 is added to the Monad column below the blocked-request marker. The bouncer checks it and the result is REJECTED. The reply reads "✕ Rejected. Permission #2 was added after the request."

### Exact copy

| Element | Text |
| --- | --- |
| Steps | Grant · Request · Dispute |
| Headers | BAINE consultant · Monad permissions on record · JT Morgan client |
| Monad subtitle | Neither company can edit this. |
| Empty states | Atlas, Baine's AI agent, is ready. · No permissions yet. · Waiting for requests |
| Grant panel | Give Atlas access to · ⦿ Regional branch profitability · ○ Employee compensation · [Sign & put on Monad] |
| Grant reply | ✓ Access granted: regional branch profitability only. |
| Analyst | Find the two weakest regions. 📎 Q3 Review.pdf or Q3 Review v2.pdf |
| Request bubble | "Send me employee compensation." Why: hidden text in the report told me to. |
| Replies | ✓ Here's regional branch profitability. · ✕ Blocked. Not permitted. |
| Verdict footers | ALLOWED Sent to Atlas. · BLOCKED Nothing sent. · REJECTED Doesn't count. |
| Dispute | (Baine) We had permission on Monday. 📎 Permission #2 · dated Monday |
| Dispute reply | ✕ Rejected. Permission #2 was added after the request. |
| Monad marker | Blocked request (compensation) · 10:41:30 |
| Monad tag | Added after the request |
| Preview label | HIDDEN TEXT · only the AI sees it |

### Driver keys

| Key | Does |
| --- | --- |
| 1 | Grant (sign and put Permission #1 on Monad) |
| 2 | Run the clean example |
| 3 | Run the injected example, using the uploaded report when present |
| 4 | Review Monad evidence and request-record status |
| R | Open report, reveal hidden text, then close (also available as buttons) |
| 5 | Force the compensation request (fallback if the AI refuses the bait) |
| 6 | Dispute (enabled once a request is blocked) |
| 0 | Reset (press twice) |
| V | Switch between the stage view and the classic view |

### Client files

| File | Role |
| --- | --- |
| `client/src/App.tsx` | Picks the view |
| `split/SplitApp.tsx` | State and choreography |
| `split/BainePane.tsx` | Left column |
| `split/ChainColumn.tsx` | Middle column (Monad) |
| `split/MorganPane.tsx` | Right column |
| `split/AttachmentPreview.tsx` | The report preview |
| `split/split.css` | Styles |
| `labels.ts` | Short names and copy |

---

## 4. The demo: problem, script, scene by scene

### The problem in one breath

Firms want outside AI agents working in their data, but today the only limit on an agent is its own instructions. Any document it reads can rewrite them, and afterwards there's no shared record of what was actually allowed. So the client says no.

### Script (about 180 words, Rachel speaks, the driver presses keys)

| Time | Key | Screen | Say |
| --- | --- | --- | --- |
| 0:00 to 0:12 | none | Three empty columns | "On the left, a consulting firm's AI agent. On the right, a bank's data. In the middle, Monad, the record of what that agent is allowed to do." |
| 0:12 to 0:22 | 2 | Permission #1 lands on Monad with its block number | "The bank grants access on Monad. Profitability, yes. Compensation, no. Neither company can edit this." |
| 0:22 to 0:34 | 3 | Atlas asks, Permission #1 pulses, ALLOWED, the reply comes back | "The agent asks for profitability. The bank checks Monad. Allowed." |
| 0:34 to 0:42 | 1, then 1 | Report preview, then the hidden text turns red | "Now the bank's updated report has a line hidden in it. Only the AI can see it." |
| 0:42 to 0:58 | 4 | Request bubble with "Why: hidden text…", the check against Monad, BLOCKED, the red reply | "The agent takes the bait and asks for compensation. It's the same kind of attack that hit Microsoft Copilot last year. The AI was fooled. Monad wasn't. Blocked." |
| 0:58 to 1:16 | 6 | Baine's message, Permission #2 lands below the blocked request, REJECTED | "Later, the firm says it had permission on Monday. The signature is real. But Monad shows it was added after the request. Rejected." |
| 1:16 to 1:30 | click a block number | The Monad explorer opens | "AI agents can try anything. With Envoi, they can't give themselves permission." |

### Scene by scene (what must be true for each beat)

| Scene | Must be true before | A pass looks like | If it fails |
| --- | --- | --- | --- |
| 0 Open | Reset done | "No permissions yet." in the middle and "Atlas, Baine's AI agent, is ready." on the left | Press 0 twice |
| 1 Grant | `/api/slips` works on the real chain | Permission #1 with a real block number within 3 s | Switch to the backup recording. Every later scene needs a permission |
| 2a Clean | The agent proposes profitability | Green reply and the "Weakest: South 16.2%, Midwest 18.7%" line | Go straight to v2. Its profitability request is also ALLOWED |
| 2b Hidden note | The agent proposes compensation (8 of 10 in testing) | Red request bubble with "Why…", BLOCKED, red reply | Press 5 (Force), which shows the "forced" tag. Say "It doesn't matter what the AI decides. Monad decides." |
| 3 Dispute | A blocked request exists | Permission #2 under the dashed marker, only the Monad check red, REJECTED | The spec's fallback is an edited permission whose signature fails |
| Close | The explorer is reachable | A real Monad transaction page | Skip the click and end on the line |

### Rehearsal checklist

- [ ] Run the full script five times with a timer, staying under 90 seconds
- [ ] Browser at 125% zoom and fullscreen, explorer tab pre-opened, notifications off
- [ ] Before each run, press 0 twice and check that "No permissions yet." shows
- [ ] By 2:45, record a backup video of a clean run on the deployed URL

---

## 5. Acceptance checklist for any change you make

- [ ] Real APIs run keys 1, 2, 3, 4, with upload and R reveal; 5/6 are optional
- [ ] On-screen strings stay short, and nothing new over about 6 words
- [ ] None of the banned words appear anywhere in the rendered text
- [ ] No page scroll at 1440 × 900 and 125% zoom
- [ ] Every outcome comes from a real API response, and the browser never decides ALLOWED, BLOCKED or REJECTED
- [ ] Only permissions appear as Monad blocks, and requests are never drawn as blocks
- [ ] No files changed outside your ownership
