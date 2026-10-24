# Envoi (hackathon demo)

One Express process serving the API and a Vite React client. In-memory state, no database.
Spec: `ENVOI_BUILD_SPEC.md`. Project rules and file ownership: `.agents/skills/envoi-contract/SKILL.md`.
- Demo handoff (stage screen, script, story — wins over older docs for screen and script): [docs/DEMO_HANDOFF.md](docs/DEMO_HANDOFF.md)
- Asks for P1/P2 (live AI, uploads, real Monad): [docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md](docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md)
- P3 build plan (UI scope, what the UI expects from P1/P2 routes): [docs/P3_BUILD_PLAN.md](docs/P3_BUILD_PLAN.md)
- P3 frontend prompt (design system, copy deck, layout): [docs/P3_FRONTEND_PROMPT.md](docs/P3_FRONTEND_PROMPT.md)

## Run
- Dev: workflow "Start application" runs `npm run dev` (tsx + Vite middleware on port 5000).
- Prod: `npm run build` then `npm run start` (serves `dist/public`). Deploy as Reserved VM.
- Typecheck: `npm run typecheck`.
- Offline checks: `npm test` (state, P1 chain/service, client requests); repeatable browser checks: `npm run test:ui` (isolated browser responses, no live writes). See [testing](docs/P3_TESTING.md).

## Environment
- `MOCK_CHAIN` was removed from development. Do not restore it for the demo; the client refuses practice-chain mode. A real-chain configuration flag alone does not prove signing or Monad readback works.
- Live sends remain explicitly paused: `MONAD_MAX_TRANSACTIONS=0` in development. Do not raise the allowance or run a live smoke/self-test without separate approval.
- Needed later (Replit Secrets, workspace AND deployment): `ISSUER_PRIVATE_KEY`, `MONAD_RPC_URL`, and an Anthropic key (`ANTHROPIC_API_KEY`) — the Replit-managed Anthropic integration was not available in this workspace.

## Layout
- `shared/contract.ts` (frozen types), `shared/scenarios.ts` (labels + report text, no protected data)
- `server/index.ts` mounts routers; `server/state.ts` + `server/routes/state.ts` (P3)
- `server/chain/*`, `server/routes/slips.ts` (P1) — Aman's signing/finalized-readback/dispute implementation is integrated unchanged from `p1/signing-and-dispute-evidence`; import chain functions via `server/chain/index.ts`
- `server/gateway/*`, `server/data/*`, `server/agent/*`, `server/routes/act.ts|agent.ts|selftest.ts` (P2) — agent and selftest are stubs
- `client/` UI (P3): three-column stage view in `client/src/split/` (Baine · Monad · JT Morgan); classic fallback in `client/src/classic/` (press V or `/?view=classic`).

## Current user instructions
- Always use the UI skill from this GitHub repo, `.agents/skills/envoi-ui/SKILL.md`, when implementing UI best practices. Preserve the chosen light theme.
- Demo order: **1 Grant → 2 Clean example → 3 Prompt-injected example → 4 Monad evidence**. Report reveal is R; Force and Dispute are optional.
- Nothing in the demo may be a mock. The browser mock path has been removed; do not re-enable it or `MOCK_CHAIN`.
- Omit the elapsed-time detail. Correct ordering on the backend is still required.
- Aman owns P1 and, at Rachel's request, combined integration after the verified P3 handoff. Do not implement or overwrite his files while waiting. See [P3 integration handoff](docs/P3_INTEGRATION_HANDOFF.md); standalone P3 checks are not full live-demo acceptance.
- P3 acceptance status: [docs/P3_ACCEPTANCE.md](docs/P3_ACCEPTANCE.md). Do not equate a finished screen or offline tests with a passing live demo.
- Reset-generation integration for P1/P2: [docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md](docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md).
- P1 integration/review (not a live pass): [docs/P1_INTEGRATION_REVIEW.md](docs/P1_INTEGRATION_REVIEW.md).
