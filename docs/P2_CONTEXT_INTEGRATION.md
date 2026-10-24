# Local P2 integration copy

This isolated checkout starts from P2 `8c7630f` and merges Rachel's persistent
workspace main at `f77a653`. The shared checkout and teammates' branches were
not edited. These additional changes are local and are not a deployment.

## Implemented

- Atomic `addActionReceipt(input, context, expectedGeneration)` validates the
  original version, identity, block and generation before publishing both records.
  Rejection changes neither IDs nor counters. Context reads return defensive copies.
- `createIsolatedState()` owns a private snapshot and has an idempotent close
  that fences delayed operations. It never creates another chain sender.
- The active six-action gateway uses atomic publication, snapshots caller input,
  checks the original slip after awaits, and fences successful and rejecting
  awaits before protected reads and publication.
- The evaluator verifies original evidence and each candidate's own signature,
  fingerprint and finalized stamp against the saved request block. Inconsistent
  or unavailable evidence returns 503 without a policy receipt. Both active and
  legacy adapters support P1's existing five-argument context interface.
- Active model proposals reject incomplete responses before tools execute.
  Legacy prompt/tool names follow the scenario. The injected chat provider has
  an explicit readiness seam, keeping storage fixtures independent of real keys.
- Dependency URLs use public npm with versions/integrity preserved. Windows
  startup and Node requirements are retained; development migration loads `.env`.

## Local verification

Commands: `npm run typecheck`, `npm test`, `npm run test:p2`, `npm run build`,
and `npm run test:ui`. `npm run test:storage` requires an explicitly supplied
development `DATABASE_URL`; never use production for its disposable test rows.
Verified results: 107 default tests passed, 84 legacy P2 tests passed with the
live test skipped, 8 PostgreSQL tests passed, and 5 browser UI tests passed.
Typecheck and production build passed. The P2 suite overlaps the default context
suite; these counts should not be added as unique test coverage.
The two former context TODOs are replaced by actual P1/P2/private-state
composition tests with genuine ephemeral signatures and synthetic same-second
blocks, recorded attempts, replay and capture/verification outages.

A portable PostgreSQL cluster is stored only in ignored `generated-artifacts/`,
listening on `127.0.0.1:55439` with database `envoi_integration`. No system service
or OS account was created. This copied app uses port 5100; its ignored `.env`
contains no signing or Anthropic key. Portable binaries are from the
[embedded-postgres project](https://github.com/leinelissen/embedded-postgres).

The actual browser/database smoke script and output are retained in
`generated-artifacts/local-website-smoke.mjs` and `.log`. It checks draft/report/
scope persistence across reload and a server restart, separate browser workspaces,
disabled spending controls and a refused sign request. No API interception is
used. Its screenshot is `generated-artifacts/local-website.png`.

Both durable chain/model budgets remain approved=0 and spent=0, and
`MONAD_MAX_TRANSACTIONS=0`. Mock application mode is off. No live model call or
chain transaction was made. The retired public self-test was not re-enabled;
production schema, external databases and deployments were not changed.
