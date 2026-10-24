# Future owner signatures — requests, not approved APIs

Reviewed source: `801dd452bd1b3ca1df5c634112191f50ac786161`.
Current integration base after main advanced: `ab38b963d581b910e108d9964d3df2d25a6b2fa8`.
Its additional P3 HTTP/session safeguards do not supply original-context storage or
an isolated-state factory. P1, P2 and the frozen shared contract are unchanged.
The owner confirmed there is **no explicit teammate approval** for new context
storage or additional isolation interfaces. The compatibility implementation uses
only delivered interfaces; the following work is separate. Do not import these
missing exports, implement owner files from this document, or treat a type declaration
or an injected owner test as approval.

## Already delivered — no request to rebuild or rename these

`server/state.ts` supplies:

```ts
getResetGeneration(): number
getGeneration(): number // already-delivered alias, same counter
isCurrentGeneration(expected: number): boolean
assertCurrentGeneration(expected: number): void
withResetGeneration<T>(expected: number, work: () => T): T
addSlip(slip: Slip, expectedGeneration?: number): Slip
addReceipt(input: NewReceipt, expectedGeneration?: number): Receipt
reset(): void
```

The existing getters/lists/counter are also available. `NewReceipt` already means
`Omit<Receipt, "id" | "createdAt">`. P1's facade already exports `latestReference`,
`lookup`, `stampMatchesRequest`, `ChainReference` and the other agreed chain helpers.
No facade export, route mount, public JSON field, configuration or library is requested.

## 1. Recorded proposed hook — missing implementation and approval

**Rachel/P3 with Aman/P1 agreement.** This is the exact existing proposal in
`docs/P1_TEAM_HANDOFF.md` and `PermissionState`, not a newly invented two-argument API:

```ts
getRequestContext(receiptId: string): OriginalRequestContext | undefined
```

`OriginalRequestContext` already exists in `server/chain/evidence.ts`, **not** the
facade. Its fields remain `generation`, `originalSlip`, `requestBlock`, `agentId`,
`action`, `resource`, `scenarioId`. Its existence does not deliver storage.

Required semantics: retrieve an immutable cloned snapshot for the receipt's
generation; validate the captured/inherited generation; never return another
generation's context after receipt-ID reuse; never recapture a request block.
The caller must verify `context.generation` against its captured operation.
If owners prefer an explicit `expectedGeneration` argument, both P1 and P3 must
agree that change. The earlier two-argument draft was **not approved or consumed**.

## 2. Atomic receipt/context publication — signature for owner agreement only

**Rachel/P3.** No function with these semantics exists in reviewed main.
The spelling below is a precise requested signature, **not a promised export**:

```ts
addActionReceipt(
  input: NewReceipt,
  context: OriginalRequestContext,
  expectedGeneration: number,
): Receipt
```

Agree the name and semantics before implementation/consumption. It must validate
generation and exact original slip/caller/action/resource/scenario linkage, clone
and freeze context, allocate the receipt ID, then publish BOTH records atomically.
An invalid/stale context must publish neither and must not advance the counter.
Storage must be private to the state instance. Public Receipt JSON is unchanged.
P2 must validate availability/admission before protected reads and preserve all
current generation guards around verification, data access and publication.

## 3. Private state construction and closure — signature for agreement only

**Rachel/P3, coordinated with P1/P2.** The reviewed main exports a singleton only.
The required contract for review is:

```ts
// Documentation-only name: not a shared type or current export.
type IsolatedState = Pick<typeof import("../../state"),
  | "getResetGeneration" | "getGeneration" | "isCurrentGeneration"
  | "assertCurrentGeneration" | "withResetGeneration"
  | "getSlip" | "addSlip" | "listSlips"
  | "getReceipt" | "addReceipt" | "listReceipts" | "getCounter" | "reset"
> & {
  getRequestContext(receiptId: string): OriginalRequestContext | undefined;
  addActionReceipt(input: NewReceipt, context: OriginalRequestContext, expectedGeneration: number): Receipt;
  close(): void;
};

createIsolatedState(): IsolatedState
```

Names, return shape and lifecycle remain subject to approval. Each instance must
own its maps, counter, generation, async generation context and immutable request
contexts. `reset()` affects that instance only; `close()` is idempotent, invalidates
admission/writes/retained contexts and prevents reopening. Admission after a parent
timeout must fail. Delayed operations must not mutate a subsequent instance.

P2 must bind BOTH a fresh gateway and permission service to the same instance, not
just isolate the parent HTTP response. Keep the existing P1 process-wide ledger
queue, unresolved-transaction reconciliation and allowance outside the state
factory. Never start a second live sender or refill the budget via reset/closure.

## 4. Existing evaluator slot — missing agreed semantics, not a new endpoint

**Aman/P1 + Je/P2 + Rachel/P3.** P1 already declares/calls this optional slot:

```ts
evaluate(
  candidate: Slip,
  action: string,
  actionTime: number,
  agentId: string,
  originalContext?: OriginalRequestContext,
): Promise<Check[]>
```

Current P2 supports the existing four-argument compatibility call. A non-undefined
fifth argument is explicitly unavailable until the contract is agreed and delivered.
The future adapter must validate original receipt/context/permission linkage and
candidate signature/digest/stamp separately; a legitimate new amendment ID/digest
must not be rejected just because it differs from the original. Use the frozen
original block for precedence. Fresh reads may verify candidate finality, never
replace that boundary. Same-time N/N+1/N+2, hash conflicts and outages are required tests.

Do not install a context getter alone into a live service: coordinate producer,
atomic store, P1 consumer and P2 evaluator together, with checks before signing/sending.
The two retained-context TODOs remain deferred until these are actually delivered.

## Evidence scope is unchanged

Application request history is not an on-chain request/receipt commitment.
`Receipt.explorerUrl` links to the checked permission. Attempt-specific evidence
still needs its own owner decision, encoding/release/retention agreement and
transaction allowance. This handoff does not select or implement that extension.
Current main's `docs/ATTEMPT_RECORDING_HANDOFF.md` is explicitly an unapproved
proposal, not a subsequent approval. Aman owns combined integration under the
newer P3 handoff; Rachel/P1 still control any separate bounded live window.
