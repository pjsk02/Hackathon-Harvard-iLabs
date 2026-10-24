---
name: Envoi team roles and integrations
description: Who the user is on the Envoi team, who owns which server files, and which Replit integrations are/aren't available
---
- The user (Rachel) owns the P3 workstream (frontend, scaffold, state routes). Aman is P1 (server/chain/*, server/routes/slips.ts) and builds in his own scratch Repl, then pushes to main. P2 owns gateway/data/agent/selftest.
  **Why:** user stated it; spec assigns file ownership per person. On Oct 24 2026 I rewrote P1's ledger/slip files at the user's "no mocks" request, then had to revert them when she said Aman was about to push the same files.
  **How to apply:** before touching any P1/P2 file, ask whether that teammate has pending work; prefer writing asks into docs/TEAM_ASKS_LIVE_AI_AND_MONAD.md instead.
- MOCK_CHAIN was removed from the dev environment on Oct 24 2026 at the user's request ("nothing about this can be a mock"). Do not re-add it; Aman holds the funded testnet demo wallet.
- searchIntegrations found no Replit-managed Anthropic integration in this workspace (Oct 2026). Agent must use ANTHROPIC_API_KEY backup (already added as a workspace secret).
