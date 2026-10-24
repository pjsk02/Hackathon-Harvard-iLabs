// OFFLINE TEST PROCESS ONLY. Never imported by the application or used as a live
// self-test adapter. A separate Node process owns this singleton state, all P1
// retained operations and the mock ledger; no shared-demo reset is possible.
import assert from "node:assert/strict";
import express from "express";
import { Wallet } from "ethers";
import type { Receipt, SelftestResponse } from "../../../shared/contract";
import { AGENT_ID, MANDATE_ID } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import * as chain from "../../chain";
import { createPermissionService } from "../../chain/permission-service";
import { act, evaluate } from "../gateway";
import { createSelftestRouter } from "../../routes/selftest";
import { captureResetGeneration } from "../../routes/state";
import { errorHandler, httpError } from "../../http";
import * as state from "../../state";
import { withTestApp } from "./reset-fixtures";

assert.equal(process.env.ENVOI_OFFLINE_SELFTEST_WORKER, "1");
assert.equal(process.env.MOCK_CHAIN, "1");
assert.equal(process.env.MONAD_MAX_TRANSACTIONS, "0");
assert.equal(process.env.ENVOI_LIVE_MODEL_SMOKE, "0");
assert.equal(chain.isMockChain(), true);
process.env.ISSUER_PRIVATE_KEY = Wallet.createRandom().privateKey; // Unfunded, memory only.

const counts = { anchors: 0, resets: 0, actions: 0, closed: 0 };
const permissions = createPermissionService({
  state, evaluate,
  chain: {
    latestReference: chain.latestReference, lookup: chain.lookup,
    anchor: async (digest) => { counts.anchors++; return chain.anchor(digest); },
  },
});
// Retain the actual permission service across runs, so its delivered generation
// hook must invalidate cached originals/disputes when this PRIVATE store resets.
const router = createSelftestRouter({
  createIsolatedSession: async (signal) => {
    let generation = state.getResetGeneration();
    const assertActive = () => {
      if (signal.aborted) throw httpError(504, "The offline test deadline was exceeded.");
      state.assertCurrentGeneration(generation);
    };
    const within = <T>(work: () => T): T => {
      assertActive();
      return state.withResetGeneration(generation, work);
    };
    return {
      evidence: "mock",
      close: async () => { counts.closed++; },
      client: {
        reset: async () => {
          assertActive();
          const expected = generation + 1;
          state.reset(); // This is the child-process store, NOT the demo singleton.
          state.assertCurrentGeneration(expected);
          generation = expected;
          counts.resets++;
        },
        createSlip: () => within(() => permissions.issue(consulting.id)),
        act: (action) => within(() => {
          counts.actions++;
          return act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action }, "forced");
        }),
        dispute: () => within(() => permissions.replayDispute()),
        getSlip: (id) => within(() => state.getSlip(id)),
        verifyStamp: (slip) => within(async () => {
          const evidence = await chain.lookup(slip.anchor!.txHash);
          const current = await chain.latestReference();
          assertActive();
          if (!chain.stampMatchesRequest(slip, evidence, current)) {
            throw httpError(503, "The offline stamp could not be verified.");
          }
        }),
      },
    };
  },
});
const app = express();
app.use("/api", captureResetGeneration);
app.use(router, errorHandler);
const runs: {
  body: SelftestResponse; mode: string | null; ms: number; generation: number;
  receipts: Receipt[]; stampHashes: string[];
}[] = [];

try {
  await withTestApp(app, async (base) => {
    for (let i = 0; i < 2; i++) {
      const started = performance.now();
      const response = await fetch(`${base}/api/selftest`);
      const body = await response.json() as SelftestResponse;
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.pass, true, JSON.stringify(body));
      assert.deepEqual(Object.keys(body).sort(), ["pass", "steps"]);
      assert.equal(body.steps.length, 4);
      runs.push({
        body, mode: response.headers.get("X-Envoi-Selftest-Mode"),
        ms: Math.max(0, Math.round(performance.now() - started)),
        generation: state.getGeneration(),
        receipts: structuredClone(state.listReceipts().reverse()),
        stampHashes: state.listSlips().map((slip) => slip.anchor!.txHash),
      });
    }
  });
  process.stdout.write(JSON.stringify({
    classification: "offline-current-main-compatibility-not-live-or-retained-context",
    pid: process.pid, counts, runs,
  }));
} finally {
  delete process.env.ISSUER_PRIVATE_KEY;
}
