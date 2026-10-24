# Verified P3 handoff to Aman — 2026-10-24

At Rachel's request, Aman owns combined integration from this handoff onward.
The independent P3 fixes are complete and checked. **This is not a claim that
the full live demo or judge-link closeout is complete.**

## Product wording follow-up

- Both views use **Product guide** and product/session language, including
  accessible labels, setup messages and recovery errors.
- The fictional client is **Goldman Stanley** and the consultant is **McBain**.
  Both built-in reports, the agent role and the downloadable Word report use
  these names.
- The current sample URL is
  `/samples/Goldman-Stanley-Q3-Data-Request.docx`. Its text and footer are
  rebranded; its original report layout and hidden white 1pt note are preserved.
  The uploaded source document under `attached_assets/` is not changed.
- P1/P2 source and the frozen shared contract are not changed. Permission IDs,
  action names, session headers and unknown-outcome protections are unchanged.
  Client error handling accepts both old and current refusal messages, so older
  owner branches remain compatible.

Follow-up verification: type checking, **83 offline checks**, **19 browser
checks**, and the production build passed. The stage desktop and classic mobile
layouts were visually checked. The workspace Word download returned HTTP 200
and matched the reviewed asset byte-for-byte; hidden-note parsing and reveal
still pass. This does not claim a live-model run, chain send or publication.

## Git reference

- Repository: https://github.com/pjsk02/Hackathon-Harvard-iLabs
- Delivery branch: `main` (Rachel explicitly requested the shared integration base)
- Original handoff branch retained: `p3/verified-handoff`
- P3 implementation commit: `84994f8`
- Upstream main included at handoff preparation: `801dd45`
- Fetch the latest `origin/main` for the P3 implementation and these instructions.
- This source synchronization is not a production publication or live-demo pass.

The original history sync added only the five P1 documentation files missing from the
task checkout. It did not alter the tested application tree. P1/P2 code and
`shared/contract.ts` match the fetched main; their implementations were not
independently edited.

At the original handoff baseline, P3 reran type checking, all **78 offline checks**,
all **17 browser checks**, and the production build successfully. The integrated
application/configuration/dependency tree matches the verified handoff exactly.
The running initial UI was also checked. No live model call or Monad send was
performed, and this verification is not live acceptance.

From his clean integration/feature branch, Aman can fetch and merge without
replacing his own work:

```sh
git fetch origin
git merge origin/main
```

Do not force-push, copy an older project snapshot over main, or drop newer owner
work. Resolve any subsequent integration conflicts against the latest owner
implementation. A separate merge of the original P3 handoff branch is not
needed once it is included in main. The task fork must also be merged through
the main app's normal task workflow; GitHub source is not a deployed app.

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

Original handoff verification: type check, production build, **78 offline
checks** and **17 browser checks** passed. The sample download matched the
checked-in asset.
The subsequent history sync left application/configuration/dependency files
byte-identical to that tested tree. Browser success fixtures are tests only,
not live-model or Monad acceptance.

## Integration work still required

1. Obtain and integrate Jay's current real agent/upload, five-check,
   original-request-context and executable self-test code. `P2-Je` has newer
   owner work; Aman should review that branch rather than relying on the older
   stale-branch assessment. This P3 wording change does not import P2 code.
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
