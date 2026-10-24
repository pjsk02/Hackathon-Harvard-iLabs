# Envoi — local development

The homepage is at `/`; the existing light workspace is at `/workspace`.
See [Tasks #13 and #14](docs/TASKS_13_14.md) for readable Atlas replies,
the persistent transaction board and their verification.
The [current local completion handoff](docs/LOCAL_COMPLETION.md) covers single-message
permission enforcement, diagnostics, Windows helpers and the remaining setup.

Use Node.js 22.12 or newer. Development runs one Express process with Vite on
[localhost:5000](http://localhost:5000); no Replit runtime is required.

From PowerShell in the project directory:

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set DATABASE_URL in .env to a dedicated development PostgreSQL database.
npm run db:push
npm run dev
```

Both startup commands load the optional root `.env` file. Existing shell
environment variables take precedence. Restart after changing `.env`. The supplied
configuration uses `MOCK_CHAIN=0` and `MONAD_MAX_TRANSACTIONS=0`: real-chain mode
is selected, but live transactions remain paused. Keep the allowance at zero;
do not restore application mock mode or run signing/live smoke tests as setup.

For the AI connection, set `ANTHROPIC_API_KEY` in your ignored `.env` and keep
`USE_OWN_KEY=1`. Coordinate the funded test-only issuer key with Aman separately.
Credentials from Replit Secrets are not transferred by Git. The app can start
without credentials; its setup status will show signing as unavailable.

```powershell
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production build on the same port. Stop development before
starting it. The persistent product needs PostgreSQL for drafts, browser isolation
and operation recovery. Startup never applies schema or grants spending budgets.
`npm test` runs the active suites including retained-context integration;
`npm run test:p2` separately runs the legacy compatibility suite with test-only
chain fixtures, zero transaction allowance, no inherited provider/wallet
credentials, and the live-provider smoke test disabled.
These checks do not establish live-model or real-chain acceptance.

For the existing isolated browser suite, start development, then in another
PowerShell terminal:

```powershell
$env:UI_BASE_URL = "http://127.0.0.1:5000"
$env:CHROMIUM_EXECUTABLE_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"
npm run test:ui
```

Use the path to your installed Chrome or Edge executable. No browser is downloaded.
See [the local P2 integration handoff](docs/P2_CONTEXT_INTEGRATION.md) for the
copied source, atomic state/context work and local verification. The persistent
product retires the old public self-test routes. The agent-skill reference below
preserves the original build notes; [persistent workspace scope](docs/PERSISTENT_WORKSPACE.md)
describes the current product.

## Envoi Replit Agent skills

Eight skills for the hackathon build. Each folder in `.agents/skills/` has one `SKILL.md`. Replit Agent reads every skill's name and description on each chat and loads the full skill only when the task needs it.

## Install (2 minutes, at 9:30)

1. In the main Repl, open the Shell and create the folder: `mkdir -p .agents/skills`
2. Drag the eight skill folders from this pack into `.agents/skills/` (or upload `envoi-replit-skills.zip` and run `unzip envoi-replit-skills.zip`).
3. Commit them in the Git pane (`chore: add agent skills`) so every teammate's Agent thread gets them.
4. Check: ask Agent (Free mode) "Which skills do you have?" It should list all eight.

These can also be pasted into Claude Code or Codex as context: give your coding agent `envoi-contract` plus the skill for your role.

## Who uses what

| Skill | Owner | Use it when |
| --- | --- | --- |
| `envoi-contract` | Everyone | Any change: types, routes, file ownership, on-screen words |
| `monad-anchor` | P1 | ledger.ts, mockLedger.ts, RPC, transactions, explorer |
| `eip712-slip` | P1 | slip.ts, `/api/slips`, `/api/dispute` |
| `envoi-bouncer` | P2 | checks.ts, gateway.ts, data, `/api/act`, `/api/selftest` |
| `claude-tool-agent` | P2 | agent.ts, `/api/agent/run`, `/api/agent/eval` |
| `envoi-ui` | P3 | client/, layout, tokens, copy, animation |
| `replit-ship` | P3 (all) | Deploying, secrets, smoke test, git, Agent modes |
| `demo-captain` | Rachel (all) | Gates, scope requests, script, judge Q&A |

## What differs from ENVOI_BUILD_SPEC.md (found by testing)

- **No `temperature: 0`.** `@anthropic-ai/sdk` 1.x removed `temperature` from request types and newer models reject it.
- **The dispute waits for chain time to pass the blocked request before anchoring.** Without this, the amended stamp can land in the same second and the dispute comes back ALLOWED (always on the mock, sometimes on Monad).
- **`issuedAt` is now minus 60 seconds.** Request time comes from the chain, so a server clock running ahead would fail "valid" on a fresh slip.
- **The mock ledger reports the real issuer address as `from`.** Otherwise "stamped" always fails on the mock, and Gate 1 can't pass.
- **The bouncer compares the request's agentId,** not a constant.

## Sources these were adapted from

- `monskills` Monad agent skills: github.com/therealharpaljadeja/monskills (gas, block states, why-monad)
- Anthropic skills: github.com/anthropics/skills (`claude-api` tool use and model notes, `frontend-design`, `webapp-testing`)
- Monad docs (testnet, RPC differences, reserve balance), Replit docs (Agent skills, modes, deployments, secrets)
- Envoi's own `src/policy-engine.js` (check and reason-code design)
- The team's ENVOI_BUILD_SPEC.md, red-team review and casebook

All code blocks were type-checked with TypeScript `--strict` against ethers 6.17 and @anthropic-ai/sdk 1.3. The signing, bouncer and dispute logic was run offline against the scenarios in the spec. Live Monad and LLM calls could not be tested from the review sandbox; run `/api/selftest` on Replit at Gate 1.
