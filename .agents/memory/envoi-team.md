---
name: Envoi integration history
description: Integration findings from a teammate's workspace require a fresh check here
---
- A teammate's environment did not offer the Replit-managed Anthropic integration during scaffold setup.
  **Why:** Integration availability is environment-specific; merged notes do not establish availability in the current workspace.
  **How to apply:** Search integrations again before choosing a provider or requesting credentials. Follow the current user's stated workstream rather than inheriting a teammate's "user" identity.

- GitHub account authorization and workspace Git attachment are separate gates.
  **Why:** A valid authorized connection can still be refused by workspace policy or attachment-service admission; reauthorizing does not resolve that layer.
  **How to apply:** Reuse the existing authorized connection. If attachment is denied, check workspace source-control restrictions and service availability rather than switching accounts, requesting tokens, or treating the app server as the Git service.
