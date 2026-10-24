# Important local work recovered and completed

This audit starts from local Tasks #13/#14 at `3f559ee` and main `cffa22c`.
Main and Rachel's branch contain no newer source changes. Aman's only extra
branch commit is a ZIP of the older scaffold; its chain/UI files are not copied
over the newer integrated product. The cancelled Replit Task #9 conversation
contains the remaining request for single-message enforcement and lighter prompt
pills. Its history was read, not resumed or edited.

## Already present

- Six selectable permissions and deterministic, fail-closed access checks.
- Persistent anonymous browser workspaces, reports and conversation history.
- Immutable permission versions, atomic receipt/context publication, isolated
  state and reset/close fencing, including same-second block ordering.
- Shared ledger queue, durable allowances, broadcast identity, original attempt
  evidence, explicit reconciliation and protection against duplicate requests.
- Readable Atlas answers, landing page, private case board and synthetic examples.

## Completed locally

`POST /api/workspace/submit` is the single user submission operation. Enforced
mode captures the selected scope and report, reuses a matching signed version or
signs/stamps a new one when the approved allowance permits, pays the protected
model allowance before the SDK, and sends every proposed action through the
existing gateway. One conversation and durable operation retain their exact
identity and case ownership. Stored phases precede external execution; lost
responses never trigger an automatic retry. No second ledger is constructed.

Document-only chat is an explicit separate mode. It has no protected tools,
signing or chain writes. Its existing daily limits include both legacy chats and
new document-mode submissions. Its failures can be closed without replay, while
protected/chain uncertainty stays blocked for explicit investigation.

The chat screen now owns selected-scope disclosure, the two request modes,
signing/checking progress, blockers and one Send message action. Quick prompts
fill the editable message without sending: Complete/Verify select enforcement;
Summarize selects document-only analysis. Pastel lavender, gold and mint pills
follow the final Task #9 request. Monad result is read-only and uses the exact
submission ID, without guessing by message text or repeating a request.

Service setup in workspace options restores prior useful diagnostics. Check
configuration reads only settings/storage. Check Monad connection explicitly
performs the existing finalized-block/local-signature checks; it never sends a
transaction or calls AI. The landing, board and ordinary status refresh do not
perform these network checks. Durable remaining allowance is included rather
than reporting only an in-memory send count.

## Windows use

```powershell
npm run local:db:start
npm run local:status
npm run dev
```

The database helper resumes only the existing portable cluster at
`127.0.0.1:55439/envoi_integration` in ignored generated artifacts. It creates no
OS service/account and downloads nothing. Other checkouts should use their own
configured development PostgreSQL service. The status command prints no keys
or connection strings and performs no RPC/model call.

The present local `.env` has no signing or Anthropic key. Configure Anthropic
privately in that ignored file and restart for document chat. Enforced requests
also require the configured issuer and approved bounded allowances. No allowance
was granted here: chain/model budgets remain approved=0/spent=0 and the local,
example and Replit transaction limits remain zero.

## Verification and excluded historical work

- 122 default offline checks passed, including eight new submission tests.
- 17 PostgreSQL/API checks passed, including same-key retries, safe crash recovery,
  original case/evidence ownership and configuration-only diagnostics.
- 20 browser checks passed for single-Send enforcement, document mode, uploads,
  readable replies, public records, unknown outcomes, diagnostics and the board.
- Typecheck and production build passed. Actual local production/browser/database
  smoke passed restart persistence, isolation, per-case drafts, mobile layout,
  configuration checks and refusal of an enforced request while paused.
- Both Windows helper commands were exercised successfully.

Historical live verification tasks #7/#10 are not run while spending is paused.
The old public self-test and shared demo/reset APIs remain retired. The local
board's chargeback is still illustrative; no bank/Walmart integration is claimed.
The historical export task is excluded because the later product instructions
explicitly removed downloads. No Replit task status, deployment, remote branch,
provider credential or teammate checkout is changed by this local completion.
