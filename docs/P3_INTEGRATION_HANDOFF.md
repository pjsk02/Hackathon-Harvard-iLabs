# Verified P3 handoff to Aman — 2026-10-24

At Rachel's request, Aman owns combined integration from this handoff onward.
The independent P3 fixes are complete and checked. **This is not a claim that
the full live demo or judge-link closeout is complete.**

## Git reference

- Repository: https://github.com/pjsk02/Hackathon-Harvard-iLabs
- Handoff branch: `p3/verified-handoff`
- P3 implementation commit: `84994f8`
- Upstream main included at handoff preparation: `801dd45`
- Use the branch's latest commit for the handoff documentation too.
- GitHub `main` is not changed by publishing this handoff branch.

The history sync added only the five P1 documentation files missing from the
task checkout. It did not alter the tested application tree. P1/P2 code and
`shared/contract.ts` match the fetched main; their implementations were not
independently edited.

From a clean team checkout, Aman can fetch and merge without replacing his files:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git merge --no-ff origin/p3/verified-handoff
```

Do not force-push, copy an older project snapshot over main, or drop newer owner
work. Resolve any subsequent integration conflicts against the latest owner
implementation. The task fork must also be merged through the main app's
normal task workflow; a GitHub branch is not a deployed app.

## Checked P3 changes

- Concealed Word runs, text markers and nested HTML remain hidden in stage and
  classic previews until reveal, while the extracted text retains the payload.
- Upload limits handle multibyte/escaped text and reject invalid/oversized input
  plainly before owner routes.
- Uploads and completed-run references survive views/reload only for the
  authoritative shared session. Reset/restart invalidates old presentation.
- Only the exact confirmed pre-tool AI failure unlocks Force. Unknown outcomes
  remain guarded, and forced requests are never attributed to the model.
- Permission links are not reused as attempt records. Absent attempt evidence is
  explicitly unrecorded, not pending. Browser link validation is not readback.
- Visible instructions, sample download/upload, clickable controls and a
  one-operation shared-demo lock are in place. Disconnection does not unlock an
  active handler; overlapping actions/Reset and stale-tab writes are refused.

Verification: type check, production build, **78 offline checks** and **17
browser checks** passed. The sample download matched the supplied file.
The subsequent history sync left application/configuration/dependency files
byte-identical to that tested tree. Browser success fixtures are tests only,
not live-model or Monad acceptance.

## Integration work still required

1. Obtain Jay's current real agent/upload, five-check, original-request-context
   and executable self-test code. The advertised P2 branch is still stale.
2. Agree the attempt/context interface with all owners. The
   [attempt-recording handoff](ATTEMPT_RECORDING_HANDOFF.md) is a proposal, not
   an implemented recorder or an approved shared-contract change.
3. Connect the real recorder using P1's existing queue/budget, then wire the
   agreed evidence/context into state and both UI layouts. Verify all evidence
   statuses and actual readback; do not infer recording from shape or a link.
4. Preserve P3's HTTP session metadata, shared lock, upload boundary and exact
   pre-tool error meaning; see [team interfaces](TEAM_ASKS_LIVE_AI_AND_MONAD.md).
5. Configure credentials securely and obtain separate bounded development and
   production allowances. `MONAD_MAX_TRANSACTIONS=0` remains unchanged here.
6. Run real workspace acceptance, then the production flow, two real self-tests,
   signed-out/two-browser access, and a genuine backup recording. Publishing,
   production configuration and a verified public judge URL are not delivered
   by this P3 branch.

Optional dispute stays disabled until original-request evidence and the live
ordering rejection are genuinely verified. No mock chain, scripted fallback,
live send or model call was used to substitute for missing acceptance.
