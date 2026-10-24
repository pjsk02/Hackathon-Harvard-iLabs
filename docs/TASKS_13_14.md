# Readable Atlas replies and transaction room

Implemented locally on `codex/p2-context-integration`, preserving main through
`cffa22c` and the P2 context/reset protections. Replit task statuses are not
changed by this implementation. Live transactions remain paused.

## Pages and replies

- `/` is an independent dark landing page with original static line artwork and
  an ownership-scoped transaction board. `/workspace` retains the light workspace.
- `/workspace?case=<id>` reopens the selected case's conversation. Native links
  support refresh and browser Back/Forward. Old `view`, `classic` and `preflight`
  query bookmarks open the current durable workspace; retired APIs are not revived.
- `AtlasReply` renders new, restored and result replies at display time with
  `react-markdown` and `remark-gfm`. Stored text, user messages and reports remain
  plain. Raw HTML and all image loading are disabled; only explicit HTTP(S)
  links without credentials are accepted, with separate-tab/no-opener behavior.
  Tables and code scroll inside the answer rather than widening the page.
- Production SPA fallback uses a trusted build root so deep links work from a
  Windows managed checkout whose absolute path contains `.codex`.

## Persistent cases

Board metadata is additive inside the existing PostgreSQL workspace document;
there is no second database, session system or required DDL migration. The first
board access imports eligible owned legacy history once into a previous-activity
case and saves exactly two separate synthetic examples. No deleted or shared
legacy conversations are reconstructed.

New cases start Open. The first reserved chat, permission or data request moves
the case to In progress; draft saves alone do not. Done is explicit, and Reopen
returns to In progress. Status edits use revisions and the same workspace row
lock as operation reservation. Active or unresolved operations prevent completion
or case switching through creation. Completed cases reject further writes until
reopened.

Case identity is included in operation deduplication and persisted with the
operation journal before external execution. Conversation, receipt and permission
references remain attached to that original case. Each case retains its own
draft and report. Opening a conversation never replays a request or automatically
refills an old attachment into the new-message composer.

Board summaries exclude task text, report contents, model replies and protected
rows. Details use associated operation metadata and only consistent saved public
records, with separate permission/request labels. They never perform RPC health
checks, reconciliation, signing or paid calls. Existing cookie ownership, CSRF
checks, expiry, quota and recovery rules remain in effect. Cross-tab signals carry
only an invalidation token; navigation, focus and relevant storage events refresh
metadata without polling. Whole-workspace reset remains a separately confirmed
destructive action, clearly stating that private cases and history will clear
while public records and usage reservations remain.

The examples are Goldman Stanley/McBain (Done) and Walmart/cardholder's bank
(In progress). They contain illustrative text and no fabricated signatures,
receipts, real-agent output, explorer links or bank outcomes. A chargeback is an
informational example, not a bank integration or permission-dispute action.

## Verification

- Default offline suite: 114 passing checks (state, chain, agent, client, context).
- PostgreSQL/API suite: 15 passing checks, including original evidence linkage,
  pending-operation isolation, concurrent status edits and cross-case chat context.
- Browser coverage: 16 existing workspace tests and 5 board/reply tests passed.
- Typecheck and production build passed.
- Actual production-build browser/PostgreSQL smoke passed case creation, selected
  draft/report retention, explicit Done/Reopen, a server restart, browser isolation,
  foreign-case refusal and mobile width. This smoke uses no API interception.
  Its ignored script/log/screenshots are `generated-artifacts/tasks-13-14-smoke.*`
  and `generated-artifacts/board-actual-{desktop,mobile}.png`.

Run `npm test`, `npm run test:storage`, `npm run test:ui`, `npm run typecheck`,
and `npm run build`. Storage tests require a dedicated development DATABASE_URL;
browser tests require a running app and CHROMIUM_EXECUTABLE_PATH. The local app is
on port 5100, using the existing isolated `envoi_integration` PostgreSQL database.
Both durable budgets remain approved=0/spent=0; local and checked-in transaction
limits remain zero. No paid provider call, chain send, deployment or live-service
acceptance is part of these checks.
