---
name: P1 collaboration scope
description: Ownership context for work requested in this workspace.
---

The user is working on P1; separate teammates are working on P2 and P3.

**Why:** The user explicitly assigned these roles when requesting the build-spec and red-team comparison.

**How to apply:** Scope implementation here to P1 unless the user requests otherwise. Identify required P2/P3 changes as coordination work rather than silently implementing teammates' portions.

Merged teammate notes may refer to their own user as P3. Do not apply that identity to this workspace's user.

**Why:** Shared Git history carries memory from separate builders; the current user's explicit P1 assignment takes precedence.

Commit this project's P1 work under the user's Git identity, not Replit Agent.

**Why:** The user explicitly requested their own attribution for both the plan and the P1 branch push.

**How to apply:** Verify the author and committer of new commits before pushing. Do not add a Replit Agent co-author attribution.

Preserve the verified P1 chain implementation when integrating P3 updates; do not replace it with teammate-provided scaffold stubs.

**Why:** Rachel's agent deliberately withdrew overlapping P1 implementation and restored placeholders so Aman's implementation would be authoritative.

**How to apply:** Review owned-file changes during integration and consume the actual interfaces delivered by the other owners, rather than assuming an earlier P1 interface proposal was adopted verbatim.
