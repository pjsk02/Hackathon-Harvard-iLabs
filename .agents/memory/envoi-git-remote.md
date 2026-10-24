---
name: Envoi git push target
description: Which GitHub repo this workspace pushes to
---
The canonical team repository is pjsk02/Hackathon-Harvard-iLabs. The other teammate repository used for design references is not the integration push destination.

**Why:** code and handoff notes are shared through the canonical repository; imported teammate instructions about pushing directly to main refer to their own workflow, not blanket authorization for every contributor.

**How to apply:** verify origin and the user's currently authorized branch before pushing. A branch created from origin/main may still track main; an upstream setting is not permission to push to main. When a main push is explicitly requested, fetch and retain teammates' published history, use a normal non-force push, and verify the remote main commit afterward. A source push is not publication or proof of a successful integrated live run.
