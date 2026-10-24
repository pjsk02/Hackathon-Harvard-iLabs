HBS × MIT AI Hackathon · Sat Oct 24 · Harvard i-lab

# Envoi: what to build tomorrow, and how

Critique of the four ideas against the judging rubric, three new ideas, and a scoped 5-hour build plan for the one we recommend.

**Recommendation: build Envoi, but change what the blockchain does.**

As written, the pitch says Envoi encrypts each agent interaction on Monad and only Envoi can decode it. A judge from Monad will ask the obvious question: if one company holds the key, why not a Postgres table? That framing makes the chain decoration.

The stronger version: when McKinsey's agent talks to a client's agent, *neither company can be trusted to hold the log*. Envoi puts a co-signed **mandate** (what the outside agent may ask for, until when) and a hash of every exchange on Monad. Each side keeps its own plaintext. Either side can later prove to an auditor exactly what was asked and released, and neither can quietly edit history. The chain is the neutral notary between two companies that don't trust each other. That is the insight, and it's one only a blockchain gives you.

## Ground truth from the event page

- **Real build time is about 5 hours**, not 6: building starts at 10:00 after kickoff, lunch is at 12:30, submissions close at 3:30, 90-second demos start at 3:45, awards at 5:30.
- **Teams are 2 or 3 people**, registered under one team name. If Abhinav is joining Aman, Rachel and Jay, someone is over the limit.
- **No tracks and no Monad-specific prize are listed**. $9,000 cash plus $3,500+ Replit credits. Monad is a sponsor and co-host, so a project that uses Monad for a real reason (not a sticker) will land well with at least some judges.
- **Pitch is "no coding experience required"**, so most of the 160+ teams will ship Replit Agent CRUD apps. A live, two-agent, on-chain demo will stand out on "working product" if it actually runs.
- Still open: whether code must be written inside Replit or just hosted there, and whether pre-written code is allowed. Ask Rachel to get both answers tonight.

## Scorecard

1–5 per criterion, scored for what a 3-person team can ship and demo in \~5 hours on Replit. Each criterion is 25%.

| Idea | Insight | Problem | Works live | Demo | Total /20 | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Envoi, reframed** (mandate + neutral notary for cross-company agents) | 4 | 4 | 4 | 5 | **17** | Build this |
| Envoi, as originally framed (Envoi holds the decryption key) | 2 | 3 | 4 | 4 | 13 | Fix framing |
| New: Expert network for agents (pay-per-answer via x402 on Monad) | 3 | 3 | 4 | 4 | 14 | Backup |
| New: Agent-vs-agent procurement deal with on-chain escrow | 3 | 3 | 4 | 5 | 15 | Backup |
| Mind Palace mobile capture | 3 | 2 | 2 | 3 | 10 | Skip |
| Company knowledge graph (agents share solved problems) | 2 | 4 | 3 | 2 | 11 | Skip |
| Agentic UI visualizer | 2 | 2 | 4 | 4 | 12 | Skip |

## Critique of each idea

### Envoi (agent audit trail on blockchain)

The strongest idea, with three problems to fix before tomorrow.

1. **"Only Envoi can decode" undercuts the reason for a chain.** If a central operator holds the key, you've rebuilt a database with extra steps, and you've made Envoi a party both companies must trust. Fix: write only hashes and decisions on-chain. Plaintext stays with the two parties. Envoi is software, not a trusted middleman.
2. **"The chain flags the rogue agent" is technically wrong.** A chain records; it doesn't police. The flag comes from a policy check. Fix: the mandate lives in a smart contract that both companies signed. The Envoi gateway checks every request against it, blocks out-of-scope ones, and writes the denial to the chain. Now the demo moment is real: "the client's CISO didn't write this rule into our app; both companies signed it, and here it is on Monadscan."
3. **"Enterprises spend billions and lack audit trails" is too abstract for "real pain for a real person."** Fix: name the person. A consulting team at kickoff sends a 60-line data request list; the client's IT and legal take weeks to release files into a data room, because once data leaves there is no record of who touched what. Agents make this worse: the client's CISO won't let an outside agent query internal systems at all without proof of what it took. Every HBS student who has done a consulting internship has lived the data-request wait. Have one teammate say it in the first person in the demo.

**Why the insight holds up:** the identity tools enterprises are rolling out for agents (Microsoft Entra Agent ID, Okta Cross App Access, Auth0 for AI Agents) are built around one company's tenant. None of them gives two companies a shared audit record of an exchange between their agents. Google's Office of the CTO frames the open question as "what actions an AI agent can take on behalf of another company, and under what agreements." Existing audit-trail vendors (e.g. TrueScreen, Asqav) and the IETF agent-audit-trail draft all do hash-chained, signed logs, but the draft itself notes a hash chain needs an external anchor to stop a party from swapping in a shorter, clean history. A public chain is that anchor, and it's neutral ground for two companies.

**Why Monad specifically** (say this out loud for the sponsor judges): every agent message is a transaction, so you need cheap fees and fast finality or the agents stall waiting for the notary. Monad advertises sub-second finality and up to 10,000 TPS at low fees; on Ethereum mainnet a 12-second block per message would kill the conversation. Monad also documents ERC-8004 (on-chain agent identity and reputation registries) and x402 (agent payments), so Envoi fits the stack Monad is pushing.

**Regulatory tailwind, used carefully:** EU AI Act Article 12 requires high-risk AI systems to automatically log events, with at least six months of retention; Annex III obligations apply from August 2, 2026, though a delay to as late as December 2027 is in trilogue. Article 12 does not require tamper-proof logs, so don't claim Envoi is legally required. Say that unverifiable logs are weak evidence, and Envoi makes them verifiable.

### Mind Palace mobile

You already have the hardest part shipped (extension, dashboard, export to NotebookLM, Obsidian and local AI), which is also the problem: judges ask what you built today. Capturing reading on a phone means an iOS share extension or Android share target, which is native work and hard to demo live from a laptop in 90 seconds. The insight ("AI brains miss subconscious reading") is good, but the pain is mild; nobody's day is ruined by an unsaved Substack quote. Keep it as your ongoing project, not tomorrow's.

### Company knowledge graph

Real pain, but crowded (Glean, Notion AI, Blitzy at enterprise scale, plus built-in memory in ChatGPT and Claude). The value only shows after weeks of accumulated queries, so the 90-second demo is a staged "imagine your team has used this for a month." Low insight score, weak live demo.

### Agentic UI visualizer

The big labs are already shipping this inside the chat: Claude artifacts, ChatGPT apps and canvas, Gemini's visual layouts, MCP-based UI extensions. A Chrome extension that re-renders their output competes with the platforms themselves and judges won't learn anything new. Easy to demo, but it's a feature, not a problem.

## New ideas worth considering

### 1. Expert network for agents (backup if the team wants payments)

GLG-style expert calls cost hundreds of dollars an hour and take days to schedule. In an agent world, a consultant's research agent pays a few cents per answer to specialist agents (a supply-chain data agent, a pharma pricing agent) through x402 on Monad. Monad hosts an x402 facilitator for mainnet and testnet, and a paid endpoint is about 40 lines of real code. Demo: the agent hits a 402 Payment Required, pays in testnet USDC, gets the answer, and the tx shows up. Weakness: "agents paying agents" is a hot hackathon theme, so it's less novel.

### 2. Agent-vs-agent procurement with on-chain escrow

A buyer's agent and a supplier's agent negotiate price and terms live on screen; the agreed terms are committed to a contract and funds go into escrow until delivery. Great demo theater. Weakness: real procurement teams won't let agents bind contracts yet, so "problem worth solving" scores lower.

### 3. Fold the best parts into Envoi as stretch goals

- **Pay-per-query:** the client charges the outside agent per data request via x402. Turns compliance cost into a revenue line for the data owner.
- **Agent passports:** register both agents in the ERC-8004 identity registry so the mandate references verifiable agent IDs.
- **Human approval for sensitive scopes:** a request for PII pauses and pings a client exec to approve, then logs the approval on-chain.

## What the Envoi demo shows

### McKinsey side

"Atlas," a research agent working on a margin-improvement study for a fictional retailer, Northwind Foods. It asks the client's agent for data in plain English.

### Client side

"Northwind DataBot," which answers from a fake internal dataset (SKU margins by region, supplier contracts, an HR salary table it must never release).

In between sits the **Envoi gateway** and a live **ledger panel**. Every message is checked against the mandate, hashed, and written to Monad testnet; each ledger row links to Monadscan. Request 1 (SKU margins, in scope) goes through with a green row. Request 2 (employee salaries, out of scope) is blocked with a red row, and the denial is on-chain too. Finally, a "Verify" button re-hashes the client's local transcript and shows it matches the chain; edit one word and it fails.

## Architecture

```
Browser UI (React, from Replit Agent)
  ├─ left: Atlas chat        ├─ middle: Envoi ledger (live)      ├─ right: Northwind chat
                │
Node/Express server on Replit
  ├─ /agents/atlas     → Claude API, system prompt = consultant
  ├─ /agents/northwind → Claude API + tool: query(dataset, fields)
  └─ Envoi gateway (every agent→agent message passes here)
        1. parse request into {scope, fields}   (LLM call, JSON output)
        2. check scope ∈ mandate.allowedScopes and now < expiry
        3. sha256(canonical message JSON)
        4. ethers.js → EnvoiNotary.log(mandateId, hash, allowed)
        5. push row to UI over SSE/websocket with tx hash
                │
Monad testnet (chain 10143)  ·  EnvoiNotary.sol  ·  Monadscan links
```

Contract sketch (deploy from Remix in \~15 minutes):

```
contract EnvoiNotary {
  struct Mandate { address requester; address owner; bytes32 scopesHash;
                   uint64 expiry; bool requesterSigned; bool ownerSigned; }
  mapping(uint256 => Mandate) public mandates;
  event MandateSigned(uint256 id, address signer);
  event Exchange(uint256 indexed mandateId, bytes32 msgHash, bool allowed,
                 string scope, uint64 at);

  function propose(uint256 id, address owner, bytes32 scopesHash, uint64 expiry) external {...}
  function sign(uint256 id) external {...}          // owner co-signs
  function log(uint256 id, bytes32 msgHash, bool allowed, string calldata scope) external {
    require(mandates[id].requesterSigned && mandates[id].ownerSigned, "unsigned");
    emit Exchange(id, msgHash, allowed, scope, uint64(block.timestamp));
  }
}
```

Keep scopes off-chain as a JSON file whose hash is in the mandate; the gateway enforces them. Logging via events is cheap and easy to read back with ethers `queryFilter`.

## Build plan for a 3-person team

| Time | Person A: chain | Person B: agents | Person C: UI + demo |
| --- | --- | --- | --- |
| 10:00–10:45 | Deploy EnvoiNotary on Monad testnet via Remix; propose + co-sign mandate from two wallets | Replit project scaffold, Claude API key in Secrets, two agent endpoints with system prompts | Build fake Northwind dataset (CSV); prompt Replit Agent for 3-panel layout |
| 10:45–12:30 | Gateway module: hash, ethers `log()`, return tx hash; test 10 writes | Agent-to-agent loop; Northwind query tool; scope parser returning JSON | Ledger panel with live rows, green/red state, Monadscan links |
| 12:30–1:00 | Lunch. Integration check: one message end to end, UI → agent → gateway → chain → UI. |  |  |
| 1:00–2:30 | Verify button (re-hash transcript, compare to chain events); tamper toggle | Scripted demo buttons: "Ask for SKU margins," "Ask for salaries" (deterministic, no LLM luck) | Polish, mandate card on screen, run the 90-second script 3 times |
| 2:30–3:15 | Feature freeze. Record a backup screen video of a clean run in case venue Wi-Fi or the RPC fails. Optional stretch only if green: x402 per-query fee or ERC-8004 agent IDs. |  |  |
| 3:15–3:30 | Submit. Deployed Replit URL, repo, backup video. |  |  |

## The 90-second demo

0:00–0:15

"Last summer I waited three weeks for a client to send data for my consulting project. Now our agents could ask their agents in seconds, but no client CISO will let an outside agent in, because there's no record both sides trust of what it took."

0:15–0:25

"Envoi is a mandate and a neutral notary for agents crossing company lines." Show the mandate card: allowed scopes, expiry, two signatures on Monad.

0:25–0:50

Click "Ask for SKU margins." Atlas asks, Northwind answers, green ledger row appears in under a second. Click the Monadscan link.

0:50–1:10

Click "Ask for salaries." Gateway blocks it; red row, denial recorded on-chain. "Neither company can delete this later."

1:10–1:25

Edit one word in the client's transcript, hit Verify: fails. Undo: passes.

1:25–1:30

"Identity tools today stop at one company's walls. Envoi is the record between them."

## Risks and how to cut them

| Risk | Mitigation |
| --- | --- |
| Faucet limits or empty wallet at 10am | Fund two testnet wallets tonight from the Monad faucet; keep private keys in Replit Secrets, never in code. |
| Replit Agent fumbles ethers/Solidity | Deploy the contract in Remix, not Replit. Give Replit Agent the ABI and address and ask only for the server call. |
| LLM says something off-script on stage | Demo buttons send fixed requests; the LLM only phrases answers. Scope decision is deterministic code. |
| RPC or Wi-Fi down during demo | Backup RPCs (Ankr, Monad infra), phone hotspot, and a recorded clean run. |
| Judge asks "why not just a signed log?" | "A signed log is held by one party. Here two companies share it, and neither can rewrite or truncate it; the chain is the external anchor even the IETF audit-trail draft says you need." |
| Judge asks "won't companies mind data on a public chain?" | "Only hashes and allow/deny decisions go on-chain. No data, no prompts." |

## Tonight's checklist

- Rachel: confirm with organizers whether code must be written in Replit, whether pre-written code is allowed, and confirm the team is 3 people max.
- Create two wallets, add Monad testnet (chain 10143, `https://testnet-rpc.monad.xyz`), fund both from `faucet.monad.xyz`.
- Get a Claude API key with credit and a Replit account each.
- Write the Northwind dataset, the two agent system prompts, the mandate JSON, and the demo script (none of this is product code).
- Decide who presents; practice the opening line until it's natural.

## Sources

- [Hackathon event page (Luma)](https://luma.com/nclbgpau)
- [Monad testnet network info](https://docs.monad.xyz/developer-essentials/testnet.md)
- [Monad: deploy a smart contract](https://docs.monad.xyz/guides/deploy-smart-contract)
- [Monad x402 integration guide](https://docs.monad.xyz/guides/x402)
- [Monad ERC-8004 guide](https://docs.monad.xyz/guides/erc-8004)
- [Decrypt: Monad mainnet launch](https://decrypt.co/347450/monad-reveals-mainnet-token-launch-date-airdrop-claim)
- [Help Net Security: EU AI Act agent logging](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/)
- [IETF draft: Agent Audit Trail](https://datatracker.ietf.org/doc/draft-sharif-agent-audit-trail/)
- [TrueScreen: agent-to-agent audit trail](https://truescreen.io/articles/agent-to-agent-audit-trail/)
- [Auth0 vs Entra Agent ID vs Okta XAA](https://www.decryptiondigest.com/blog/auth0-entra-agent-id-okta-xaa-ai-agent-authorization-comparison)
- [Google Cloud OCTO: agents leaving the building](https://cloud.google.com/transform/your-agents-are-leaving-the-building-ask-octo)
- [Zylos: AI agent governance 2026](https://zylos.ai/research/2026-05-01-ai-agent-governance-compliance-2026/)