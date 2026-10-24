# Persistent evaluation workspace

The current task supersedes the old demo-only, no-database and teammate file-ownership restrictions. The light three-panel UI remains; no accounts or production authorization claims are made.

Managed PostgreSQL stores anonymous workspaces, drafts, extracted report text, immutable signed versions, conversations, original request contexts and evidence. Run `npm run db:push` only in development. The post-merge script applies the development schema; production schema follows Replit Publish, never startup DDL.

Cookies are Secure, HttpOnly, SameSite=Strict host cookies with random 256-bit capabilities, stored only as SHA-256 on the server. Losing the cookie loses access. Anonymous browser isolation is not authenticated identity. Content expires at 30 days; expired rows and old operation payloads are cleaned when another workspace is created. Metadata tombstones and issuer-wide broadcast reservations remain. Limits are enforced per workspace and globally; capacity exhaustion fails explicitly.

Both database budget rows start with **zero** approved allowance. No allowance was increased for this work. `MONAD_MAX_TRANSACTIONS=0` is an independent pause. An operator must receive explicit approval before increasing the durable `approved` total for chain/model budgets; never reset `spent`, delete broadcast history, or treat resets/restarts as renewed approval. Historical spent approvals must not be reintroduced as fresh budget. There is no public budget-management route.

Every external operation has a durable UUID and phase before external execution. Unknown outcomes are not automatically repeated, including after reset. Read-only status checks wait one minute to avoid racing active work and claim a new owner token, fencing stale commits. Lost model responses cannot be queried from Anthropic by this app. Model-only chat failures are closed without retry, with their uncertain provider outcome and potential charge explicitly retained; distinct new messages are allowed. After a process crash, Check status safely closes the model-only or local-save operation. Reset refuses active operations. Protected-data/chain uncertainty remains subject to read-only reconciliation. Reset cannot erase public records or refund usage.

All six datasets are fictional server-side evaluation data, not live integrations. Model tools only propose; the original five deterministic checks control every result. Uploaded report text is untrusted. All extracted text persists; original file formatting and hidden-format metadata do not.

The product now uses sequential Permissions → Chat → Result screens, not simultaneous panels. Public attempt recording is restricted to BLOCKED receipts with a failed scope check. ALLOWED results and other denials retain local receipts without a new request transaction. Historical public records remain readable. Permission stamps remain a separate signing operation. Visible company names are Goldman Stanley and McBain.

## Design source assessment

The public 21st.dev community component directory was accessible and assessed on 2026-10-24. It offers React/Next.js components, including forms, buttons and AI chats. No 21st integration is connected. No specific component's redistribution license or accessibility guarantees were established, so no third-party component source was copied or added. Native checkboxes, details, labels, buttons and tables meet the lightweight interaction needs without another dependency or subscription.

## Verification

User-requested document chat is independent of protected-data access: `/api/workspace/chat` uses the configured Anthropic client, the current extracted attachment and recent conversation, with no tools or chain writes. Daily limits are 20 messages per workspace and 200 shared, counting unknown attempts; reset does not refund them. No sample download or export feature is included. Protected-data agent calls continue to require a signed version and their separate approved budgets.

`npm test`, `npm run test:storage`, `npm run test:ui`, `npm run typecheck`, `npm run build`. Browser fixtures intercept external APIs; storage tests use disposable rows in managed development PostgreSQL and never approve chain/model budgets. No live chain transaction or paid model verification is authorized by these tests.
