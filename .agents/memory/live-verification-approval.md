---
name: Live verification approval
description: How to interpret the user's bounded testnet authorization across processes and workspaces
---
The original approval covered five real Monad transactions in total. Those five were consumed. Restarting, moving workspaces, resetting the demo, or changing a per-process counter does not renew that authorization.

On 2026-10-24 the user separately approved at most three additional Monad transactions plus one Claude proposal-only call, after incorporating the teammates' latest changes. This is a distinct allowance, not permission to repeat the original five-write pass or run the four-write self-test.

**Why:** the allowance is a user-approved spending boundary, not merely a process-local implementation limit. Earlier approval remains spent even when receipt caches disappear.

**How to apply:** keep sends paused during development and obtain a new explicit allowance before live verification. Count every permission, amendment, and attempt commitment. A forced-path chain test is not proof of live Claude behavior; a model call also needs its own deliberate verification decision.
