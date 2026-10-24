import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Slip } from "../shared/contract";
import { errorHandler } from "./http";
import { captureResetGeneration, stateRouter } from "./routes/state";
import * as state from "./state";
import { createPermissionService } from "./chain/permission-service";
import { createMonadLedger } from "./chain/ledger";

// Isolated state fixtures: never rendered by the app, no protected data or keys.
const slip: Slip = {
  label: "Original", signature: "unit-test-only", digest: "unit-test-only", anchor: null,
  mandate: { mandateId: "test-permission", issuer: "unit-test-only", agentId: "test-agent", resource: "test-resource",
    scenarioId: "test", allowedActions: [], issuedAt: 1, expiresAt: 2, nonce: "test" },
};
const receipt: state.NewReceipt = {
  kind: "action", agentId: "test-agent", mandateId: "test-permission", source: "forced",
  decision: "BLOCKED", action: "test-action", actionTime: 1, checks: [], data: null, explorerUrl: null,
};

beforeEach(() => state.reset());

test("every reset advances the generation, including empty resets", () => {
  const before = state.getResetGeneration();
  state.reset(); state.reset();
  assert.equal(state.getResetGeneration(), before + 2);
  assert.equal(state.isCurrentGeneration(before), false);
});

test("P1's generation getter observes exactly the same reset boundary", () => {
  const before = state.getGeneration();
  assert.equal(before, state.getResetGeneration());
  state.reset();
  assert.equal(state.getGeneration(), before + 1);
  assert.equal(state.getGeneration(), state.getResetGeneration());
});

test("integrated P1 sees a reset during its first read and starts a fresh retry", async () => {
  let ready!: () => void;
  let resume!: () => void;
  let reads = 0;
  let signs = 0;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const service = createPermissionService({
    state,
    chain: {
      latestReference: async () => {
        if (++reads > 1) throw new Error("Fresh operation reached its first read.");
        ready();
        await gate;
        return { chainId: 10143, blockNumber: 1, blockHash: `0x${"1".repeat(64)}`, blockTimestamp: 1 };
      },
      anchor: async () => { throw new Error("This reset test must never submit a record."); },
      lookup: async () => null,
    },
    evaluate: async () => [],
    sign: async () => { signs++; throw new Error("This reset test must never sign."); },
  });
  const original = state.withResetGeneration(state.getGeneration(), () => service.issue("consulting"));
  await started;
  state.reset();
  const rejected = assert.rejects(original, /session changed/);
  resume();
  await rejected;
  await assert.rejects(service.issue("consulting"), /Fresh operation reached its first read/);
  assert.equal(reads, 2);
  assert.equal(signs, 0);
  assert.deepEqual(state.listSlips(), []);
});

test("zero live-send allowance prevents signing and RPC submission in the real ledger", async () => {
  let calls = 0;
  const forbidden = () => { calls++; throw new Error("No signer or RPC should be touched."); };
  const ledger = createMonadLedger(async () => forbidden(), forbidden, { maxTransactions: 0 });
  await assert.rejects(ledger.anchor(`0x${"2".repeat(64)}`), /paused/);
  assert.equal(calls, 0);
});

test("current-generation writes and existing synchronous callers still work", () => {
  const generation = state.getResetGeneration();
  state.addSlip(slip, generation);
  state.addReceipt(receipt, generation);
  state.addReceipt(receipt);
  assert.equal(state.getSlip(slip.mandate.mandateId), slip);
  assert.equal(state.getCounter(), 2);
});

test("explicit stale writes are rejected without changing state or the counter", () => {
  const generation = state.getResetGeneration();
  state.reset();
  assert.throws(() => state.addSlip(slip, generation), /demo was reset/);
  assert.throws(() => state.addReceipt(receipt, generation), /demo was reset/);
  assert.deepEqual(state.listSlips(), []);
  assert.deepEqual(state.listReceipts(), []);
  assert.equal(state.getCounter(), 0);
});

test("an operation cannot enter an already expired generation", () => {
  const generation = state.getResetGeneration();
  state.reset();
  assert.throws(() => state.withResetGeneration(generation, () => state.addSlip(slip)), /demo was reset/);
});

test("async operations retain their starting generation across awaits", async () => {
  const generation = state.getResetGeneration();
  await state.withResetGeneration(generation, async () => {
    await Promise.resolve();
    state.reset();
    await Promise.resolve();
    assert.throws(() => state.addSlip(slip), /demo was reset/);
    assert.throws(() => state.addReceipt(receipt), /demo was reset/);
  });
  assert.equal(state.getCounter(), 0);
});

test("a fresh explicit token cannot bypass an expired request context", () => {
  state.withResetGeneration(state.getResetGeneration(), () => {
    state.reset();
    assert.throws(() => state.addSlip(slip, state.getResetGeneration()), /demo was reset/);
  });
});

test("one expired operation does not poison the new session", async () => {
  let finishOld!: () => void;
  const gate = new Promise<void>((resolve) => { finishOld = resolve; });
  const old = state.withResetGeneration(state.getResetGeneration(), async () => {
    await gate;
    state.addReceipt(receipt);
  });
  const rejection = assert.rejects(old, /demo was reset/);
  state.reset();
  state.withResetGeneration(state.getResetGeneration(), () => state.addReceipt(receipt));
  finishOld();
  await rejection;
  assert.equal(state.getCounter(), 1);
  assert.equal(state.listReceipts().length, 1);
});

test("reset clears stored records as well as invalidating their generation", () => {
  state.addSlip(slip);
  state.addReceipt(receipt);
  state.reset();
  assert.deepEqual(state.listSlips(), []);
  assert.deepEqual(state.listReceipts(), []);
  assert.equal(state.getCounter(), 0);
});

test("HTTP reset prevents a delayed request in another tab from writing", async () => {
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let resume!: () => void;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const app = express();
  app.use("/api", captureResetGeneration);
  app.use(stateRouter);
  app.post("/api/test-delayed-write", async (_req, res) => {
    ready();
    await gate;
    state.addSlip(slip);
    state.addReceipt(receipt);
    res.json({ ok: true });
  });
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const old = fetch(`${base}/api/test-delayed-write`, { method: "POST" });
    await started;
    assert.equal((await fetch(`${base}/api/reset`, { method: "POST" })).status, 200);
    resume();
    const response = await old;
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "The demo was reset; start this action again." });
    assert.equal(state.listSlips().length, 0);
    assert.equal(state.listReceipts().length, 0);
    assert.equal(state.getCounter(), 0);
  } finally {
    resume();
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  }
});
