# P3 frontend implementation guide

This guide intentionally points to the maintained handoff instead of repeating
an older copy deck, key map or mock workflow.

## Read before changing UI

1. `replit.md`: current user instructions and ownership.
2. `.agents/skills/envoi-ui/SKILL.md`: UI practices; keep the existing light theme
   and current flow where older skill examples differ.
3. [Demo handoff](DEMO_HANDOFF.md): authoritative story, layout, copy rules,
   controls, upload behavior, recovery and spoken demo.
4. [P3 build plan](P3_BUILD_PLAN.md) and [acceptance](P3_ACCEPTANCE.md).

## Non-negotiable boundaries

- **1 Grant → 2 Clean example → 3 Injected example → 4 Monad evidence.**
  **R** previews/reveals; **5** Force and **6** Dispute are optional.
- P3 owns client, state, state routes, route mounting and docs. Do not implement
  or overwrite Aman/P1 or Jay/P2 files. The shared contract needs team agreement.
- The browser renders decisions; it never decides access.
- No browser simulation mode, practice-chain demo, scripted-model substitution,
  invented explorer link or fabricated successful rejection.
- Do not embed protected server data in the client.
- A request's checked permission link is not its own on-chain record.
- Health is configuration information, not proof of live signing, Monad or AI.
- A timeout is not cancellation. Preserve uncertainty across view changes and
  reloads; no automatic signing or model retry.
- Keep controls locked during active work and show recovery beside the action.
- Use plain-language errors, keyboard/focus access, responsive layout and
  reduced-motion behavior.
- No elapsed-time bracket, new branding, extra scenario picker or unrelated UI.

## Checks

Use the repeatable commands in [P3 testing](P3_TESTING.md). Distinguish isolated
UI tests from live backend acceptance. Never mark the complete demo ready solely
because a build, screenshot or offline suite passes.
