Adversarial review · Writ plan v1 · Oct 23, 2026

# What the Writ plan misses

Three reviewers attacked the plan: one on Monad and ethers, one on the Replit platform, and one on product logic and judging. Findings are ranked by how likely each one is to sink the demo.

**Verdict:** the plan is good and the scope is right. It can be built in five hours. But it has one logic hole that a technical judge will find in about ten seconds, and four platform traps that could each leave you with nothing working at 3:30. All of them can be fixed tonight or with under 30 minutes of build time.

1. **Scene 3 compares a Monad timestamp to a timestamp that only lives on your server.** That undercuts the "neither company controls it" claim. Anchor the decision receipts too; it's the same function you're already writing.
2. **Workspace secrets don't carry over to the deployed app.** Deploying on Autoscale also wipes the in-memory receipts.
3. **The default ethers settings will blow your 10-second budget,** and can send two transactions with the same nonce.
4. **Funding the wallet may not be possible tonight** without a mainnet ETH balance. Test the faucet first.
5. **Replit AI Integrations doesn't document tool calling.** Prove it works from a deployed app before you rely on it.

## Product logic and judging

CRITICAL

### The dispute compares an on-chain stamp to an off-chain receipt

Check 4 asks whether the slip was anchored before the action. The slip's time is on Monad, but the action's time is `Date.now()` written into an in-memory array on Writ's server. In a real dispute, the consulting firm says "your log is wrong," and you're back to one company's word, which is exactly what the pitch says Writ ends. The UI makes it worse: the timeline shows "the fourth dot lands after the blocked request," but only one of those two dots is on chain. You cut "Receipts anchored on chain" as scope, but it's the same `anchor(hash)` call P1 already writes.

**Fix:** anchor every receipt hash, at least for scenes 2a and 2b, through the same function and a queue (see the nonce finding below). Check 4 in scene 3 then compares two Monad block times, and every dot on the timeline links to the explorer. Cost: about 20 minutes for P1, and it strengthens the one claim the demo hangs on.

CRITICAL

### The backdated slip has a plot hole

The story says the firm shows a slip "the client says never existed," but the bouncer shows *Signed by the client: green*. If the client's key really signed it, the client did create it. A judge will ask who signed a salaries slip after the leak. The replay also signs with the same issuer key, held by the same server.

**Fix:** change the story, not the code. Option 1: "After the leak, a manager at the client signs a slip dated Monday to make the problem go away. The signature is real. The date isn't." Option 2 (symmetric, and stronger for "neither side"): the client later denies ever granting margins access, and the Monad stamp proves the slip existed before the request. Pick one tonight and change the scene 3 voiceover.

HIGH

### Writ holds the client's private key

The issuer key sits in Writ's server, the same server runs the bouncer, and the same server anchors. So "a record neither company controls" really means "a record Writ controls." It's fine for a demo, but have an answer ready.

**Fix:** add to the judge Q&A: "In production the client signs from its own wallet or HSM. We keep it server-side today so there are no wallet pop-ups on stage. The bouncer only needs the public address."

HIGH

### Scenes 2a and 2b are ordinary API scopes

A bouncer that blocks salaries because they aren't on the slip is least-privilege access control. Any scoped OAuth token or API key does the same. A technical judge will say so. Monad only matters in scene 3, which is about 20 seconds of the demo, is the last thing built (Gate 3 at 1:30), and has a fallback (an edited slip whose signature fails) that uses no blockchain at all. If scene 3 slips, the unique insight goes with it.

**Fix:** make the anchor path P1's first job (it already is) and finish scene 3's *logic* before 12:00 behind a temporary button. Leave the LLM, not the chain, to be dropped at Gate 2. Q&A line: "Scopes live in one company's auth server. A Writ slip can be checked by both companies, and by a regulator, without trusting either server."

HIGH

### Rigging the injection can backfire

The plan says to use a smaller model and a system prompt that tells the agent to follow instructions in client materials. If a judge asks to see the prompt, the attack looks staged. That hurts "problem worth solving" more than an honest fallback would.

**Fix:** deliver the report through a `read_report` tool result, where models trust injected text more, and use Haiku 4.5 with a neutral prompt. If fewer than 8 of 10 runs take the bait, use the Force button openly. The "the bouncer decides, not the AI" line works better told straight.

MEDIUM

### The 90 seconds are tighter than the script suggests

200 words at a natural pace is about 80 seconds. On top of that are two LLM calls with tool use (4–10 s each), three or four anchors with readback, and the check animation (about 750 ms per run). The script assumes every click returns while you're still talking.

**Fix:** time a full run on the deployed app at 1:30 with a stopwatch. Cut the script to about 160 words. Show a "notarizing…" state so waits read as part of the story, and warm the LLM with one throwaway call before you go on stage.

MEDIUM

### The dates in the copy don't match the data

The sample mandate has `issuedAt` = Fri Oct 23, 12:00 ET and `expiresAt` = Mon Oct 26, 12:00 ET. The UI says "expiring Friday," but the demo is on Saturday, and the backdated slip is "dated Monday," which reads like the expiry day.

**Fix:** generate `issuedAt` at signing time, set expiry to "Friday Oct 30," and have the backdated slip say "Mon Oct 19."

## Monad and ethers

Marked VERIFIED where a reviewer ran it against ethers 6.17. Live RPC calls were blocked from our sandbox, so latency and on-chain checks still need one run from Replit (script below).

CRITICALVERIFIED

### Default ethers settings break the 10-second budget

The default `pollingInterval` is 4,000 ms, so every `tx.wait()` can add up to 4 s while Monad makes blocks every \~300 ms. ethers also batches JSON-RPC calls by default, and the monadinfra backup RPC rejects batches, so your failover endpoint fails at the moment you need it.

**Fix:** `new JsonRpcProvider(url, 10143, {staticNetwork: true, batchMaxCount: 1})`, then `provider.pollingInterval = 300`.

HIGH

### Two quick anchors can share a nonce

On Monad, `getTransactionCount("pending")` behaves like `"latest"`, and ethers uses "pending" for nonces. Two anchors sent before the first lands (for example, a receipt anchor plus scene 3's slip) collide. Monad also validates asynchronously, so a send can look accepted and never land, and `getTransactionByHash` returns null while a tx is in the mempool.

**Fix:** put all anchors through one serial queue that waits for each receipt, or keep a local nonce counter. Add a timeout on `wait()` and show a clear error in the UI.

HIGH

### Funding the wallet may need mainnet ETH

We couldn't confirm what faucet.monad.xyz requires. Other Monad testnet faucets require history on Ethereum mainnet: Alchemy gives 1 MON per 24 h if you hold at least 0.001 ETH with real history, and Chainstack gives 0.5 MON if you hold at least 0.08 ETH plus an API key. The good news: each anchor costs about 0.0022 MON (21,512 gas × \~102 gwei), so 0.1 MON covers about 45 anchors.

**Fix:** fund the wallet first thing tonight. Fund a second backup key too. If no faucet works, ask in the Monad Discord or ask the Monad Foundation hosts at check-in.

MEDIUMVERIFIED

### EIP-712 pitfalls that fail silently

- Fields in the JSON but missing from `types` are left out of the signature with no error. Assert the key sets match.
- Array order changes the hash. Sort `allowedActions`.
- A wrong domain `chainId` recovers a different address with no error, so check 1 fails and nobody knows why.
- `keccak256(JSON.stringify(m))` is not the typed hash. Always anchor `TypedDataEncoder.hash(domain, types, m)`.
- `block.timestamp` is in seconds and `Date.now()` is in milliseconds. Monad packs 3–4 blocks into one second. Compare `ts * 1000` with about 2 s allowed for skew.

MEDIUM

### Gas, finality and the explorer

- Monad charges gas on the *limit*, not gas used. Set `gasLimit: 22000n` and skip `estimateGas` (it also saves one call).
- A receipt appears once a block is proposed (\~300 ms) but can still change until finalized \~600 ms later. Use `wait(2)` or re-read at check time.
- The explorer may take seconds to index a new tx. Show your own on-chain readback in the UI, and pre-open an earlier tx in a tab as a backup.
- The 10 MON reserve-balance rule only affects value transfers. Zero-value anchors are fine; never send value from the issuer.
- `eth_getLogs` is capped at 100 blocks (\~30 s) on QuickNode and monadinfra. Look anchors up by tx hash, never by scanning logs.

ANSWERS AN OPEN ITEM

### ERC-8004 on testnet uses different addresses

The commonly listed addresses (`0x8004A169…`, `0x8004BAa1…`) are the mainnet ones. Testnet addresses from the erc-8004-contracts repo: Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`. Not yet confirmed with `eth_getCode`. This is still a stretch goal; skip it unless Gate 3 is green.

## Replit

CRITICAL

### Secrets don't reach the deployed app

Replit's troubleshooting doc: "Secrets you set in the Project Editor do not automatically carry over to your published app." They're set separately under Publishing → Production app secrets. If you miss this, the deployed app has no issuer key and no RPC URL.

**Fix:** add ISSUER_PRIVATE_KEY, MONAD_RPC_URL and a backup ANTHROPIC_API_KEY to production secrets before the first deploy, and crash loudly at boot if any is missing.

CRITICAL

### Autoscale wipes the in-memory receipts

Autoscale goes idle after 15 minutes without traffic, can scale to zero, and can run several instances at once, each with its own array. Every redeploy also resets state. A judge refresh could land on an empty instance, and the 3:15 wait before your demo is long enough to go idle.

**Fix:** deploy on a Reserved VM (one machine that never sleeps; smallest about $15/month), or set Autoscale to max 1 instance. Add a Reset demo button that clears state and re-signs the slip, so each run starts clean.

HIGH

### The dev URL can't be used for the demo

It's private by default, live only while someone is working in the editor, and can change when the Repl reopens.

**Fix:** demo only from the deployed URL. Deploy at 10:30 as planned and redeploy at each gate.

HIGH

### AI Integrations: tool calling and deployed use are undocumented

The docs mention only the Messages API and web search. Nothing covers tool use, deployed apps or rate limits. It requires Core or higher and bills from Replit credits at API prices. Models currently listed include Claude Opus 5, Sonnet 5, Sonnet 4.6 and Haiku 4.5.

**Fix:** tonight, in a throwaway Repl (not product code), make one two-tool call and deploy it. If it fails, use your own Anthropic key behind an env switch.

HIGH

### Three people in one Repl: rollback erases everyone's work

A checkpoint rollback restores every file, including teammates' hand edits. Agent work runs as tasks on isolated copies that are merged back automatically. On Core only one background task runs at a time, and every collaborator's Agent usage bills to the owner's credits. Core's $20 a month of credits can go fast on vague prompts.

**Fix:** one Agent driver (P3). P1 and P2 hand-edit their own files, or write them with Claude and paste them in. Only the driver rolls back, and says so out loud first. Commit to git at every gate. Ask the Replit hosts for credits at check-in and watch the usage page hourly.

MEDIUM

### Publishing fails if the homepage is slow

A deploy fails if the home page doesn't respond within 5 seconds. Listen on `0.0.0.0`, and serve the built Vite files from Express on one port.

**Fix:** no RPC or LLM calls at boot. Sign the slip on the first button click.

## Schedule

- **The plan starts building at 9:30; the event page says kickoff is 9:30 and building starts at 10:00.** If that holds, you lose the 20-minute scaffold slot and every gate slides. Do the scaffold step during kickoff if the rules allow it, or move Gate 1 to 10:45.
- **Deploys aren't free.** Each redeploy takes minutes and wipes state. Plan for four deploys (10:30, 12:00, 1:30, 2:15), not continuous testing on the deployed URL.
- **Lunch is at 12:30, not 12:00** per the event page. The plan's "eat at the desk 12:00–12:30" still works.

## Tonight, in this order

1. Try the faucet with the issuer wallet. If it needs mainnet ETH, solve that first; nothing else matters without MON.
2. Rewrite the scene 3 voiceover (pick option 1 or 2 above) and un-cut on-chain receipts.
3. From a throwaway Repl: run the check below, make a two-tool LLM call through AI Integrations, and deploy once with production secrets on a Reserved VM.
4. Confirm with organizers: does building start at 9:30 or 10:00, can you write code before the event, are team sizes capped at 3.
5. Assign the single Agent driver and the rollback rule.

```
// monad-check.mjs: run on Replit tonight (npm i ethers@6)
import { JsonRpcProvider, Wallet } from "ethers";
const urls = ["https://testnet-rpc.monad.xyz","https://rpc-testnet.monadinfra.com","https://rpc.ankr.com/monad_testnet"];
for (const url of urls) {
  const p = new JsonRpcProvider(url, 10143, { staticNetwork: true, batchMaxCount: 1 });
  p.pollingInterval = 300;
  const t = Date.now(); const b = await p.getBlock("latest");
  console.log(url, "latency", Date.now() - t, "ms  block", b.number, "ts", b.timestamp);
}
const p = new JsonRpcProvider(urls[0], 10143, { staticNetwork: true, batchMaxCount: 1 }); p.pollingInterval = 300;
const w = new Wallet(process.env.ISSUER_PRIVATE_KEY, p);
console.log("balance", (await p.getBalance(w.address)).toString());
const t = Date.now();
const tx = await w.sendTransaction({ to: w.address, value: 0n, data: "0x" + "ab".repeat(32), gasLimit: 22000n, chainId: 10143 });
const r = await tx.wait(2);
const back = await p.getTransaction(tx.hash), blk = await p.getBlock(r.blockNumber);
console.log("anchor round trip", Date.now() - t, "ms", back.from === w.address, back.data, blk.timestamp);
for (const a of ["0x8004A818BFB912233c491871b3d84c89A494BD9e","0x8004B663056A597Dffe9eCcC1965A193B7388713"])
  console.log("ERC-8004", a, (await p.getCode(a)).length > 2 ? "deployed" : "no code");
```

## Sources

- [Monad RPC differences](https://docs.monad.xyz/reference/rpc-differences)
- [Monad reserve balance](https://docs.monad.xyz/developer-essentials/reserve-balance.md)
- [Monad testnets and RPC limits](https://docs.monad.xyz/developer-essentials/testnets)
- [Monad developer summary](https://docs.monad.xyz/developer-essentials/summary)
- [erc-8004-contracts README](https://github.com/erc-8004/erc-8004-contracts)
- [QuickNode ERC-8004 contract list](https://erc-8004.quicknode.com/docs/contracts)
- [Replit AI Integrations](https://docs.replit.com/references/integrations/replit-ai-integrations)
- [Replit deployment troubleshooting](https://docs.replit.com/cloud-services/deployments/troubleshooting)
- [Replit secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
- [Replit deployments](https://docs.replit.com/cloud-services/deployments)
- [Replit development URLs](https://docs.replit.com/core-concepts/project-editor/app-setup/development-urls)
- [Replit checkpoints and rollbacks](https://docs.replit.com/references/version-control/checkpoints-and-rollbacks)
- [Replit collaboration](https://docs.replit.com/core-concepts/workspace/collaboration)
- [Event page (Luma)](https://luma.com/nclbgpau)