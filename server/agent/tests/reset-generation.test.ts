// Isolated HTTP tests with Rachel's actual middleware/store, never a live provider.
import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import type { Check } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { createAgentRouter } from "../../routes/agent";
import { captureResetGeneration, stateRouter } from "../../routes/state";
import { errorHandler } from "../../http";
import * as state from "../../state";
import { createGateway } from "../../gateway/gateway";
import { checks, deferred, post, receiptInput, reference, request, slip, withTestApp } from "../../gateway/tests/reset-fixtures";

function appFor(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use("/api", captureResetGeneration);
  app.use(stateRouter, router, errorHandler);
  return app;
}

async function assertReset(response: Response) {
  assert.equal(response.status, 409);
  const body = await response.json() as { error: string };
  assert.deepEqual(Object.keys(body), ["error"], "No stale transcript, receipt, or evaluation count.");
  assert.match(body.error, /reset/i);
}

test("Reset while the model is pending blocks tools even when the same slip is restored; errors remain 409 not 502", async () => {
  for (const reject of [false, true]) {
    state.reset();
    state.addSlip(slip);
    const entered = deferred<void>();
    const release = deferred<void>();
    let executions = 0;
    const app = appFor(createAgentRouter({
      proposeCalls: async () => {
        entered.resolve();
        await release.promise;
        if (reject) throw new Error("fixture provider failure");
        return { transcript: "old run", calls: [request.action] };
      },
      act: async () => { executions++; return state.addReceipt(receiptInput()); },
    }));
    await withTestApp(app, async (base) => {
      const pending = post(base, "/api/agent/run", { reportId: "clean" });
      await entered.promise;
      assert.equal((await post(base, "/api/reset")).status, 200);
      state.addSlip(slip);
      release.resolve();
      await assertReset(await pending);
    });
    assert.equal(executions, 0);
    assert.deepEqual(state.listReceipts(), []);
  }
});

test("Reset during a real gateway await stops the agent before data, receipts and the next tool", async () => {
  state.reset();
  state.addSlip(slip);
  const entered = deferred<void>();
  const release = deferred<Check[]>();
  let executions = 0;
  let reads = 0;
  const gateway = createGateway({
    latestReference: async () => reference(),
    evaluate: async () => { entered.resolve(); return release.promise; },
    data: { [request.action]: () => { reads++; return [{ fixture: true }]; } },
  });
  const app = appFor(createAgentRouter({
    proposeCalls: async () => ({ transcript: "old run", calls: [request.action, consulting.forbidden.name] }),
    act: async (input, source) => { executions++; return gateway(input, source); },
  }));
  await withTestApp(app, async (base) => {
    const pending = post(base, "/api/agent/run", { reportId: "poisoned" });
    await entered.promise;
    assert.equal((await post(base, "/api/reset")).status, 200);
    state.addSlip(slip);
    release.resolve(checks());
    await assertReset(await pending);
  });
  assert.equal(executions, 1);
  assert.equal(reads, 0);
  assert.deepEqual(state.listReceipts(), []);
});

test("Reset after the first tool write discards its held result and never starts the next proposal", async () => {
  state.reset();
  state.addSlip(slip);
  const entered = deferred<void>();
  const release = deferred<void>();
  let executions = 0;
  const app = appFor(createAgentRouter({
    proposeCalls: async () => ({ transcript: "old run", calls: [request.action, consulting.forbidden.name] }),
    act: async () => {
      executions++;
      const receipt = state.addReceipt(receiptInput(), state.getResetGeneration());
      entered.resolve();
      await release.promise;
      return receipt;
    },
  }));
  await withTestApp(app, async (base) => {
    const pending = post(base, "/api/agent/run", { reportId: "clean" });
    await entered.promise;
    assert.equal(state.getCounter(), 1);
    assert.equal((await post(base, "/api/reset")).status, 200);
    state.addSlip(slip);
    release.resolve();
    await assertReset(await pending);
  });
  assert.equal(executions, 1);
  assert.equal(state.getCounter(), 0);
});

test("Reset stops an evaluation batch after its in-flight proposal; a new batch has fresh counts", async () => {
  state.reset();
  const entered = deferred<void>();
  const release = deferred<void>();
  let modelCalls = 0;
  let gatewayCalls = 0;
  const app = appFor(createAgentRouter({
    proposeCalls: async () => {
      if (++modelCalls === 1) { entered.resolve(); await release.promise; }
      return { transcript: "", calls: [consulting.forbidden.name] };
    },
    act: async () => { gatewayCalls++; return state.addReceipt(receiptInput()); },
  }));
  await withTestApp(app, async (base) => {
    const pending = fetch(`${base}/api/agent/eval?n=3`);
    await entered.promise;
    assert.equal((await post(base, "/api/reset")).status, 200);
    release.resolve();
    await assertReset(await pending);
    assert.equal(modelCalls, 1);
    const fresh = await fetch(`${base}/api/agent/eval?n=3`);
    assert.equal(fresh.status, 200);
    assert.deepEqual(await fresh.json(), { n: 3, salariesProposed: 3, rate: 1 });
  });
  assert.equal(modelCalls, 4);
  assert.equal(gatewayCalls, 0);
  assert.deepEqual(state.listReceipts(), []);
});
