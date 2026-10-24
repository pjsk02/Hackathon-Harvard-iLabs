# P1 / P2 / P3 integration handoff

This implements the additive attempt-recording handoff, starting from the team's main branch. It preserves the existing UI and permission/dispute contracts; it does not add a database, authentication, a smart contract, polling, or voice input/output.

## What changed

### P1 — permissions and Monad records

- Each action retains its original permission snapshot and finalized request block. The dispute compares block ordering, including different blocks in the same second.
- Attempts have their own server-generated UUID and versioned, allowlisted commitment. The exact tuple is defined in `shared/attempt-record.ts`.
- The commitment includes only the permission fingerprint, original request block, bounded agent/action enums, source, decision, and five check booleans. Reports, uploaded text, tool arguments, transcripts, names, and returned data are not included or hashed into it.
- Permissions and attempts share the same signer, nonce queue and transaction allowance. Only a zero-value self-transaction containing a 32-byte fingerprint is submitted.
- Finalized readback must match chain, sender, recipient, value, status, data, canonical block and expected fingerprint before an attempt is recorded.
- Reset/generation and allowance checks run at the queued operation and submission boundaries, including after asynchronous signing and before rebroadcast. Lowering the allowance or setting it to zero cannot be bypassed by pending work.
- Pending signed transactions retain their nonce barrier. Reset does not cancel a transaction that was already broadcast.

### P2 — gateway and Claude

- Only the gateway imports protected data. All five checks and the generation fence must pass before data access.
- Authorization and recording are independent: an allowed data access stays allowed if its later recording fails. The receipt reports the recording failure separately.
- Claude now makes one real tool-proposal call using the uploaded report when supplied. Hidden-note markers are removed but their text is retained.
- At most three valid proposals are executed. Each proposal produces its own action attempt; no forced request or scripted response substitutes for an unsuccessful model response.
- The model receives no protected tool results. Invalid tools/arguments and provider failures are explicit errors; raw provider errors are not logged.
- Anthropic SDK retries are disabled. The default model is `claude-haiku-4-5`; `AGENT_MODEL` can override it. The existing managed/own-key configuration remains supported.
- `ANTHROPIC_API_KEY` is a server-side secret, not a client variable or repository file. A managed connection also requires its managed base URL.

### P3 — evidence and recovery

- `Receipt.attemptEvidence` is optional. Absence is an application record, not a pending chain transaction.
- The UI distinguishes absent, pending, recorded, failed, and invalid evidence. Only validated recorded evidence gets an attempt explorer link.
- `Receipt.explorerUrl` still refers to the permission. Permission and attempt counts are separate.
- Failed recording shows a controlled, safe explanation without changing the access decision. Arbitrary provider details are not rendered.
- Pending attempts have a manual read-only recheck. No polling, automatic write retry, or mock demo path was introduced.
- Existing reset, upload, request-timeout and unknown-outcome protections remain.

## API changes to carry into other workspaces

| Route | Behavior |
| --- | --- |
| `POST /api/act` | Requires a UUID-v4 `Idempotency-Key` header. Each new intentional action uses a new key. |
| `POST /api/agent/run` | Same header requirement; accepts and uses the existing optional `upload` field. |
| `POST /api/attempts/:attemptId/reconcile` | Returns the existing receipt after a read-only status check. No signing, rebroadcast, new receipt, data access, or counter increment. |
| `GET /api/selftest` | Read-only requirements and budget status. **Does not run a test.** |
| `POST /api/selftest` | Explicit manual forced-path test requiring an empty session, no unresolved transaction, and at least **four** unused approved transactions. |

Same-key retries share the same model/action operation. Changed input or keys from a prior reset generation fail explicitly. The browser retains unknown-action identity across reloads and does not automatically retry it. If an original request block cannot be established, the call fails before data access; it does not invent a receipt.

Self-test writes: original permission, allowed attempt, blocked attempt, amended permission. It stops on failed or unconfirmed evidence and does not call Claude. It never silently resets existing state.

## Verification and safety boundary

Automated tests inject offline model responses and an in-process fake RPC transport. They do not call live Claude or spend test MON. The production client cannot select these fixtures.

Commands:

```sh
npm run typecheck
npm test
npm run build
npm run test:ui
```

Browser tests intercept every `/api/` request and exercise the running frontend only.

Verified in this workspace: typecheck, production build, **92 offline unit/API checks**, and **14 browser tests** passed. Browser checks cover split/classic views, manual reconciliation, forged evidence, request recovery, uploads, keyboard/reduced-motion behavior and responsive layouts. The running app's read-only health check reports `mockChain:false`; its recording allowance remains zero. The initial live screen was also visually inspected.

The prior five-transaction authorization has been consumed. Keep `MONAD_MAX_TRANSACTIONS=0` until the user approves a new bounded verification pass. Proposed minimal next pass: **three new transactions** for an original permission, one allowed attempt, and one blocked attempt. This is not the four-write self-test and does not verify a new dispute. A deliberate live Claude check is separate and billable to the configured provider.

No new live model calls or Monad writes were performed during the initial integration. Do not describe offline assertions as new live evidence.

### Subsequent approval and priority status fix

The user subsequently approved the proposed three new transactions and one Claude proposal-only call, with the latest team changes incorporated first. That new allowance has not been used by the readiness checks.

The health endpoint now performs an on-demand local signature/recovery check and a real finalized-block read from Monad. The live check on 2026-10-24 verified signing and returned Monad testnet block 73,875,579. It submitted no transaction and made no model call. The UI now reports verified connectivity separately from paused or exhausted recording allowance. Eight health-status unit checks, three browser checks and typecheck passed. This is connection verification, not a new transaction test.

The latest main/P3 and P2 branches have been fetched but are not yet merged into this integration branch. Finish that reconciliation before using the new live-test allowance.

## Explicit limitations

- State, attempt recovery, request deduplication and the send counter are process-local. There is no durable replay/recovery guarantee across restarts; do not replenish approval by restarting or automatically replay lost work.
- An issuer commitment proves what this application committed, not independent truth about model reasoning or data execution.
- Audio transcription, microphone capture and speech synthesis are not implemented by adding an Anthropic key.
- The demo has no authentication or model-usage rate limit. Protect paid/write endpoints before public exposure. Do not represent this as a production authorization service.
- No integration branch was pushed or merged into main as part of this handoff.
