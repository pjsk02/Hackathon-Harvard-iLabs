# Envoi (hackathon demo)

One Express process serving the API and a Vite React client. In-memory state, no database.
Spec: `ENVOI_BUILD_SPEC.md`. Project rules and file ownership: `.agents/skills/envoi-contract/SKILL.md`.
- Demo handoff (stage screen, script, story — wins over older docs for screen and script): [docs/DEMO_HANDOFF.md](docs/DEMO_HANDOFF.md)
- P3 build plan (UI scope, what the UI expects from P1/P2 routes): [docs/P3_BUILD_PLAN.md](docs/P3_BUILD_PLAN.md)
- P3 frontend prompt (design system, copy deck, layout): [docs/P3_FRONTEND_PROMPT.md](docs/P3_FRONTEND_PROMPT.md)

## Run
- Dev: workflow "Start application" runs `npm run dev` (tsx + Vite middleware on port 5000).
- Prod: `npm run build` then `npm run start` (serves `dist/public`). Deploy as Reserved VM.
- Typecheck: `npm run typecheck`.

## Environment
- `MOCK_CHAIN=1` is set for development only, so the chain uses `server/chain/mockLedger.ts`. Must be off from Gate 2.
- Needed later (Replit Secrets, workspace AND deployment): `ISSUER_PRIVATE_KEY`, `MONAD_RPC_URL`, and an Anthropic key (`ANTHROPIC_API_KEY`) — the Replit-managed Anthropic integration was not available in this workspace.

## Layout
- `shared/contract.ts` (frozen types), `shared/scenarios.ts` (labels + report text, no protected data)
- `server/index.ts` mounts routers; `server/state.ts` + `server/routes/state.ts` (P3)
- `server/chain/*`, `server/routes/slips.ts` (P1) — `slip.ts` and `ledger.ts` are stubs; import chain functions via `server/chain/index.ts`
- `server/gateway/*`, `server/data/*`, `server/agent/*`, `server/routes/act.ts|agent.ts|selftest.ts` (P2) — agent and selftest are stubs
- `client/` UI (P3): three-column stage view in `client/src/split/` (Baine · Monad · JT Morgan); classic fallback in `client/src/classic/` (press V or `/?view=classic`); `/?mock=1` runs every beat in the browser
