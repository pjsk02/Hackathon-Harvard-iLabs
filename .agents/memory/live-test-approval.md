---
name: Live test approval
description: Why transaction authorization must span process restarts rather than reset with an in-memory sender limit.
---

Treat the user's approved testnet write count as a limit for the entire verification session, not a fresh allowance for each process or script.

**Why:** Development hot reload restarts the sender and resets in-memory limits. A configured, funded issuer does not itself authorize additional broadcasts.

**How to apply:** Pause real sends during edits/restarts, keep a cumulative count outside the running sender, enable only the remaining approved allowance for a verification batch, and leave new starts paused after the allowance is consumed. Do not use a standalone script or a second workspace to bypass the total.
