---
name: Envoi git push target
description: Which GitHub repo this workspace pushes to
---
The canonical team repository is pjsk02/Hackathon-Harvard-iLabs. The other teammate repository used for design references is not the integration push destination.

**Why:** code and handoff notes are shared through the canonical repository; imported teammate instructions about pushing directly to main refer to their own workflow, not blanket authorization for every contributor.

**How to apply:** verify origin and the user's currently authorized branch before pushing. A branch created from origin/main may still track main; an upstream setting is not permission to push to main.
