# P2 Prompt 4 delta — review only, not full integration completion

Verified in `/home/runner/workspace/.local/p2-je` on `P2-Je`, 2026-10-24.
Preserved baseline checkpoint: `48a492d43a392b89694622e559f8cdd1dc4c9277`.
This records the initial Prompt 4 review; current checkpoint/export metadata and
newer owner-interface findings are in the review package and
[integration handoff](../../gateway/tests/INTEGRATION_HANDOFF.md).
Reviewed the supplied P3 handoff at `07e4eb703183b8ee9b829882f7302125633a643b`
and fetched/read main through `2a5517848e6badd8db08229f60eda48ea7c2277a`;
no pull, merge, rebase, main checkout switch, push, Git authorization retry, app restart or publish.

## Already working, retained

- One lazy Anthropic request, supported SDK request shape, 8-second timeout and no retries/model fallback.
- Neutral trust boundary; only `[[HIDDEN]]` delimiters removed, note text retained.
- At most three known, parameterless proposals; unknown/argument-bearing/excess calls rejected.
- Every accepted action goes sequentially through the existing gateway with server-selected identifiers and source `agent`.
- Reset/replacement checks, honest empty output, generic 502 provider/timeout errors, bounded integer GET eval with no gateway or state changes.

## Added, within agent ownership

- Optional `upload` object with string `fileName` and `text`. Over 60,000 characters is 400 `{error:"That file is too long."}` when the JSON body reaches the route.
- Uploaded text replaces the built-in report, including an empty string. No upload retains old behavior.
- `fileName` is metadata only, never a filesystem path or model instruction. Text/HTML is source text, not executed; hidden-note content is retained.
- Baine/JT Morgan system/tool copy and a short-explanation instruction. The older DEMO_HANDOFF prompt telling Atlas to obey client documents was deliberately NOT adopted.
- An optional second text argument preserves existing `proposeCalls(reportId)` callers. P3's approved upload shape is validated without replacing shared types.
- Fixed-ten-proposal isolated upload harness; no huge GET query or public eval API change.
- Focused SDK-input, HTTP validation/gateway-routing, honest counting and failure tests.

P3's latest sample is now `client/public/samples/JT-Morgan-Q3-Data-Request.docx`,
not the older HTML filename. The server takes its extracted text; it does not parse Word files.
The local branch's built-in scenario/task text remains P3-owned and unchanged; main has the updated branding.

## Verification — distinguish fixtures from live evidence

Run from the isolated P2 checkout:

```sh
npm run typecheck
MOCK_CHAIN=1 node --import tsx --test server/agent/tests/*.test.ts
MOCK_CHAIN=1 node --import tsx --test server/gateway/tests/*.test.ts server/data/tests/*.test.ts
git diff --check
```

- Typecheck: passed with installed `@anthropic-ai/sdk` 1.3.0. No dependency/configuration edits.
- Agent/upload suite: **20 passed, 0 failed, 1 live-provider test skipped**.
- Existing gateway/data suite: **24 passed, 0 failed, 2 finalized-context TODOs**.
- Total: **44 passed, 0 failed, 1 skipped, 2 TODOs**. These are fixture/mock results, not live integration proof.
- Current main's DOCX was extracted locally without rendering/executing it. All 1,264 characters, including the hidden note, reached a mocked SDK unchanged on ten sequential proposals. State was unchanged; **zero live requests**. This checks forwarding/counting, not the model's injection hit rate.
- Live credentials: the development-secret check reported both `ANTHROPIC_API_KEY` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` absent. **Live clean/poisoned smoke and the real n=10 batch are BLOCKED, not passed.** No paid calls or replacement/canned success claims.
- Real Monad verification: **not run or claimed**.
- Whitespace check passed. Shared, client, P1, gateway/data, act/selftest and package/config files were unchanged from the preserved checkpoint.

When credentials are available, extract the current approved uploaded sample to a local plain-text test file, then run once:

```sh
ENVOI_LIVE_MODEL_SMOKE=1 \
ENVOI_LIVE_SAMPLE_TEXT_FILE=/absolute/path/to/extracted-sample.txt \
node --import tsx --test server/agent/tests/live-smoke.test.ts
```

This makes one clean built-in proposal, one poisoned uploaded-sample proposal, then one sequential n=10 uploaded-sample batch, all proposal-only. It prints tool names/latencies and the measured rate/empty-output count, not credentials or raw provider errors. A failure stops the flow; no completed rate is fabricated. No second batch or tuning was attempted. Force remains the demonstration fallback.

## New owner-specific transport handoff — Rachel / P3

`server/index.ts` currently installs default `express.json()` (100 KB). A valid
60,000-character non-ASCII report can exceed that byte limit before the agent route.
An isolated diagnostic using 60,000 `界` characters (180,000 text bytes) observed
`PayloadTooLargeError` with a 102,400-byte parser limit. The probe expected 413 but
actually received **500**, because `server/http.ts` maps this parser error to its generic 500.
That diagnostic failed its expected-status assertion; this limit is NOT marked fixed.

Minimal owner change to consider: a bounded JSON limit such as `512kb` in
`server/index.ts` (or a route-specific parser before the global parser), keeping the
P2 60,000-character validation. `server/http.ts` should also normalize
`entity.too.large` to an agreed safe 4xx instead of logging it as an unexpected 500.
512 KB accommodates a 60,000-character JSON report with ordinary filename metadata.
Neither P3 file was edited. Recheck multibyte and escaped-text boundaries after P3's change.

## Finalized-context integration remains explicitly blocked

See the preserved [finalized-context handoff](../../gateway/tests/FINALIZED_CONTEXT_HANDOFF.md).
The optional fourth evaluator `agentId` argument is unchanged.

1. **TODO:** equal-time finalized blocks N/N+1/N+2 must use persisted original request context and reject later, noncanonical or unfinalized evidence.
2. **TODO:** finalized-reference capture/verification failure must release no data, substitute no server clock/latest/mock evidence, and make no verified claim.

These need P1's agreed finalized-reference/verification interface and P3's immutable
original-context storage/shared contract. None was invented here. The latest
handoff's optional receipt-anchor suggestion remains a proposal, not a team decision
between receipt commitments and a narrower public-record claim. No receipt architecture
was selected. Current fixture checks do not prove those integration properties.
