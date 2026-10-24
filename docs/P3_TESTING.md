# Repeatable P3 checks

## Commands

```sh
npm run typecheck
npm test
npm run test:ui
npm run build
```

- `npm test`: isolated state/reset and browser-transport unit tests.
- `npm run test:ui`: opens the running development app in Chromium, intercepts
  every `/api/*` request inside a private test browser context, and exercises the
  actual UI. It never sends a signing, model, Reset or self-test request to the
  running server. Successful test responses are not proof of live integration.
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
- Allowed table, blocked result, own-source evidence labels and request count.
- Unbuilt backend, invalid JSON, incomplete replies, unavailable health,
  lost write response, manual read-only recovery and page-reload persistence.
- Duplicate click suppression and no automatic re-submission.
- Unsupported, empty, oversized, overlong and corrupt upload errors.
- Keyboard typing guards, focus, reduced motion, projector and mobile widths.
- Two-press Reset and the distinction between cleared state and public records.
- Classic/pre-flight recovery and no automatically started self-test.

## Live acceptance is separate

After merging P1/P2, verify the same user flow with no interception: genuine
signature, finalized Monad readback, real uploaded text supplied to Claude,
deterministic checks, each attempt's own public record, reset/retry isolation,
and errors that never masquerade as successful outcomes.

Do not call the live self-test or signing routes without an approved testnet send
allowance. P1's default zero allowance intentionally pauses sends.
