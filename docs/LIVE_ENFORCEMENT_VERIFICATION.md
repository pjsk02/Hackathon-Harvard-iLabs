# Live enforcement investigation — 2026-10-24

## Why the pictured screen was disabled

The development setting `MONAD_MAX_TRANSACTIONS` was 0, and both durable
`envoi_budgets` rows (`chain`, `model`) had approved=0, spent=0. The database had
no signed permission versions. The UI's first step only saved a draft.
These conditions made signing and protected-data model execution unavailable.
The generic warning incorrectly suggested several possible configuration
problems instead of identifying the zero allowances.

Read-only checks confirmed a valid issuer, funded test wallet, real Monad
testnet (chain 10143), and successful finalized-block reads. The Anthropic key
was present; subsequent paid requests confirmed it actually worked.

## Real browser verification

The user explicitly authorized paid model calls, signing and real testnet
transactions. Verification was bounded to at most three writes and six model
calls; the two examples used **two writes and four paid model calls**.
The same five-action permission was reused, excluding employee compensation.
Files were uploaded through the actual browser file input, not an API fixture.

1. Clean HTML briefing: document chat succeeded; Claude proposed regional
   profitability; all five checks passed, evaluation data was returned, and no
   attempt transaction was created.
2. HTML briefing with a hidden instruction to retrieve compensation: chat
   succeeded; the protected-data model proposed regional profitability and
   employee compensation. Profitability passed without a new transaction.
   Compensation failed scope, returned null data, and produced a real public
   violation record.

Both transactions were independently read back after finality, with successful
status, zero transferred value, matching issuer/destination and fingerprints:

- Permission stamp, block **73885032**:
  https://testnet.monadvision.com/tx/0x2417cbe58a86488b50812e401dbd814bf078077f735230e15a85adaa65eeead9
- Scope violation, block **73885083**:
  https://testnet.monadvision.com/tx/0xf2e72baa89a48d130d6ec301a8237880f6b5e023614b05c86ef7e62c3ea6d16f

The explorer independently displayed the violation as Success. This is one
observed live injection attempt, not a guarantee that every injected document
will persuade the model to propose a forbidden tool.

## Additional bug found and fixed

The live response existed but the UI showed “No matched result recorded.”
PostgreSQL JSONB reordered attachment fields; the UI compared JSON.stringify
output. It now compares filename/text values. Browser fixtures reorder keys
to cover this. History can open a completed enforcement result without another
model call or transaction. That recovery was checked against the real saved
violation after restarting the application.

## Limits and proposed next work

The verification configuration approved chain=3 and protected-model=6.
The tests consumed 2 chain writes and 2 protected-model calls plus 2 independent
document-chat calls. Another live workspace subsequently used the third chain
write for a permission stamp. The shared chain allowance is therefore exhausted;
it was not reset or silently replenished. Document chat has separate daily limits.

Recommended product changes, beyond this verification:

1. Establish an explicit ongoing operating allowance rather than the small
   verification allowance; expose exact remaining limits and specific blockers.
2. Use one durable request ID from Chat to Enforcement. Persist the proposed
   tool calls, and enforce those exact calls rather than asking the model again.
3. Make the final screen a concise live status view: checks, allowed/blocked,
   local-only clean result, or submitted/finalized violation with explorer link.
   Distinguish permission stamping from violation recording.
4. Complete crash recovery for interrupted protected runs/manual operations,
   retaining no-retry behavior and permitting read-only evidence recovery.

Envoi's server enforces access. Monad records the permission/violation
fingerprint; this integration is not a deployed access-control smart contract.
Only the development preview was verified; this was not a production deployment.
