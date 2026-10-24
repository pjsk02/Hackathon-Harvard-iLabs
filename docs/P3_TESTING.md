# Repeatable P3 checks

## Commands

```sh
npm run typecheck
npm test
npm run test:ui
npm run build
```

- `npm test`: isolated state/reset/HTTP, integrated P1 chain/service, browser-transport and presentation-store unit tests. `npm run test:chain` runs P1's suite alone.
- `npm run test:ui`: opens the running development app in Chromium, intercepts
  every `/api/*` request inside a private test browser context, and exercises the
  actual UI. The two-browser test forwards intercepted API requests only to an
  isolated local Express server using P3's real shared-action middleware and
  test-only permission responses. No test sends signing, model, Reset or
  self-test work to the running application. Successful test responses are not
  proof of live integration.
- The application imports no test helpers, has no fixture route and has no
  query parameter that enables simulation.

## Browser prerequisites

Start the existing application workflow. In Replit, the test uses the development
preview domain and installed Chromium automatically. Elsewhere, supply:

```sh
ENVOI_TEST_BASE_URL=https://your-development-app.example \
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium \
npm run test:ui
```

`puppeteer-core` is a development dependency; it does not download a browser.
Missing browser/app configuration fails clearly rather than skipping tests.
Do not run browser tests against production.

## Coverage

- Grant-first ordering and dependencies between examples.
- Supplied hidden-note Word variant: upload, reveal, Escape, retained injection
  body after the clean example.
- Mixed visible/hidden nested HTML, direct body text and inline spans extracted
  exactly once; explicit text markers; classic and stage pre-reveal colors.
- View switches and reload preserve uploads and completed steps only for the
  current authoritative session; changed permissions/missing receipt references,
  reset and process-restart identities invalidate obsolete progress.
- Only the exact known pre-tool AI error allows Force; unknown tool outcomes,
  network errors and malformed replies remain guarded. Forced requests are not
  described as model requests.
- 60,000-unit multibyte/JSON-escaped inputs reach an isolated server intact;
  overlong content and oversized JSON get explicit rejection messages.
- Allowed table, blocked result, own-source evidence labels and request count.
- Unbuilt backend, invalid JSON, incomplete replies, unavailable health,
  lost write response, manual read-only recovery and page-reload persistence.
- Duplicate click suppression and no automatic re-submission.
- Unsupported, empty, oversized, overlong and corrupt upload errors.
- Keyboard typing guards, focus, reduced motion, projector and mobile widths.
- Two-press Reset and the distinction between cleared state and public records.
- Classic/pre-flight recovery and no automatically started self-test.
- Two independent browsers cannot reset or overlap active server work; disconnected
  clients do not release the lock. Stale-session writes are rejected before the
  owner handler. Reset remains usable after completion without refilling limits.
- Missing signing configuration disables starting the flow. Scripted model
  output cannot complete an example; real-model refusal is not a fabricated block.
- No attempt record/link is inferred from its checked permission's explorer link.

## Live acceptance is separate

P1 code is integrated with sends paused; after the remaining P2 integration and
separate live-test approval, verify the same user flow with no interception: genuine
signature, finalized Monad readback, real uploaded text supplied to Claude,
deterministic checks, each attempt's own public record, reset/retry isolation,
and errors that never masquerade as successful outcomes.

Do not call the live self-test or signing routes without an approved testnet send
allowance. P1's default zero allowance intentionally pauses sends.
