// Real P3 generation/store semantics; injected finalized-reference/evaluator/data boundaries.
// These regressions do NOT establish finalized-context or live-chain correctness.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Check } from "../../../shared/contract";
import * as state from "../../state";
import { createGateway } from "../gateway";
import { checks, deferred, receiptInput, reference, request, slip } from "./reset-fixtures";

const isReset = (error: unknown) =>
  error instanceof Error && "status" in error && error.status === 409 && /reset/i.test(error.message);

test("Reset during clock or evaluation rejects the same reinserted slip, even when the pending operation rejects", async () => {
  for (const phase of ["clock", "evaluation"]) {
    for (const reject of [false, true]) {
      state.reset();
      state.addSlip(slip);
      const entered = deferred<void>();
      const release = deferred<void>();
      let evaluated = 0;
      let reads = 0;
      let writes = 0;
      const pause = async () => {
        entered.resolve();
        await release.promise;
        if (reject) throw new Error("fixture outage");
      };
      const act = createGateway({
        latestReference: async () => { if (phase === "clock") await pause(); return reference(); },
        evaluate: async () => {
          evaluated++;
          if (phase === "evaluation") await pause();
          return checks();
        },
        data: { [request.action]: () => { reads++; return [{ fixture: true }]; } },
        addReceipt: (input, generation) => { writes++; return state.addReceipt(input, generation); },
      });
      const pending = act(request, "forced");
      await entered.promise;
      state.reset();
      state.addSlip(slip); // Deliberately reuse BOTH object identity and the fixed mandate ID.
      release.resolve();
      await assert.rejects(pending, isReset, `${phase}, rejected=${reject}`);
      assert.equal(evaluated, phase === "evaluation" ? 1 : 0);
      assert.equal(reads, 0);
      assert.equal(writes, 0);
      assert.equal(state.getCounter(), 0);
      assert.deepEqual(state.listReceipts(), []);
    }
  }
});

test("gateway supplies the captured write generation and recomputes fresh work after receipt ID reuse", async () => {
  state.reset();
  state.addSlip(slip);
  let reads = 0;
  const writes: number[] = [];
  const act = createGateway({
    latestReference: async () => reference(),
    evaluate: async () => checks(),
    data: { [request.action]: () => [{ read: ++reads }] },
    addReceipt: (input, generation) => {
      assert.equal(typeof generation, "number");
      writes.push(generation!);
      return state.addReceipt(input, generation);
    },
  });
  const originalGeneration = state.getResetGeneration();
  const original = await act(request, "forced");
  state.reset();
  state.addSlip(slip);
  const fresh = await act(request, "forced");
  assert.deepEqual(writes, [originalGeneration, originalGeneration + 1]);
  assert.equal(original.id, fresh.id, "P3 deliberately restarts receipt IDs after Reset.");
  assert.notStrictEqual(original, fresh);
  assert.deepEqual(original.data, [{ read: 1 }]);
  assert.deepEqual(fresh.data, [{ read: 2 }]);
  assert.deepEqual(state.listReceipts(), [fresh]);
});

test("explicit write token rejects a Reset at the synchronous data/write boundary outside HTTP context", async () => {
  state.reset();
  state.addSlip(slip);
  let reads = 0;
  const act = createGateway({
    latestReference: async () => reference(),
    evaluate: async () => checks(),
    data: { [request.action]: () => { reads++; state.reset(); return [{ fixture: true }]; } },
  });
  await assert.rejects(act(request, "forced"), isReset);
  assert.equal(reads, 1, "The synthetic Reset happens inside, not before, the synchronous fixture read.");
  assert.equal(state.getCounter(), 0);
  assert.deepEqual(state.listReceipts(), []);
});

test("P3 request context rejects stale writes even if a caller supplies the new explicit generation", async () => {
  for (const kind of ["slip", "receipt"]) {
    state.reset();
    const started = state.getResetGeneration();
    const release = deferred<void>();
    const pending = state.withResetGeneration(started, async () => {
      await release.promise;
      const fresh = state.getResetGeneration();
      return kind === "slip"
        ? state.addSlip(slip, fresh)
        : state.addReceipt(receiptInput(), fresh);
    });
    state.reset();
    release.resolve();
    await assert.rejects(pending, isReset);
    assert.deepEqual(state.listSlips(), []);
    assert.deepEqual(state.listReceipts(), []);
  }
});
