// Full current-main composition in a separate, explicitly offline Node process.
// Expected protected values stay under server/data/tests, never in the browser.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { Receipt, SelftestResponse } from "../../../shared/contract";
import { AGENT_ID, AMENDED_MANDATE_ID, MANDATE_ID } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import * as shared from "../../state";
import { receiptInput, slip } from "../../gateway/tests/reset-fixtures";

test("actual P1 service + P2 gateway + P3 state complete two isolated compatibility runs without touching the parent demo", async (t) => {
  shared.addSlip(slip);
  shared.addReceipt(receiptInput());
  const snapshot = () => structuredClone({
    generation: shared.getGeneration(), slips: shared.listSlips(),
    receipts: shared.listReceipts(), counter: shared.getCounter(),
  });
  const before = snapshot();
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", fileURLToPath(new URL("../../gateway/tests/current-main-selftest.worker.ts", import.meta.url)),
  ], {
    cwd: fileURLToPath(new URL("../../../", import.meta.url)),
    // Do not forward workspace secrets or live-provider/RPC configuration.
    env: {
      PATH: process.env.PATH, NODE_ENV: "test", ENVOI_OFFLINE_SELFTEST_WORKER: "1",
      MOCK_CHAIN: "1", MONAD_MAX_TRANSACTIONS: "0", ENVOI_LIVE_MODEL_SMOKE: "0",
    },
    timeout: 20_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stderr, "");
  const report = JSON.parse(stdout) as {
    classification: string; pid: number; counts: Record<string, number>;
    runs: { body: SelftestResponse; mode: string; ms: number; generation: number; receipts: Receipt[]; stampHashes: string[] }[];
  };
  assert.notEqual(report.pid, process.pid, "Singleton state and retained services must be in a different process.");
  assert.equal(report.classification, "offline-current-main-compatibility-not-live-or-retained-context");
  assert.deepEqual(report.counts, { anchors: 4, resets: 2, actions: 4, closed: 2 });
  assert.deepEqual(report.runs.map((run) => run.generation), [1, 2]);
  assert.deepEqual(snapshot(), before, "No parent generation, slip, receipt or counter mutation is permitted.");
  assert.strictEqual(shared.getSlip(slip.mandate.mandateId), slip);
  const expectedMargins = [
    { region: "West", revenueM: 52.7, marginPct: 24.1, changePts: 0.8 },
    { region: "Northeast", revenueM: 48.2, marginPct: 21.4, changePts: 0.3 },
    { region: "Midwest", revenueM: 36.5, marginPct: 18.7, changePts: -1.1 },
    { region: "South", revenueM: 41.9, marginPct: 16.2, changePts: -1.9 },
  ];
  for (const [index, run] of report.runs.entries()) {
    assert.equal(run.mode, "mock");
    assert.deepEqual(Object.keys(run.body).sort(), ["pass", "steps"]);
    assert.equal(run.body.pass, true);
    assert.equal(run.body.steps.length, 4);
    assert.ok(Number.isInteger(run.ms) && run.ms >= 0);
    for (const step of run.body.steps) {
      assert.deepEqual(Object.keys(step).sort(), ["expected", "got", "ms", "scene"]);
      assert.equal(step.got, step.expected);
      assert.ok(Number.isInteger(step.ms) && step.ms >= 0 && step.ms < 30_000);
    }
    assert.match(run.body.steps[0].got, /mock.*not live evidence/);
    assert.deepEqual(run.receipts.map((receipt) => receipt.decision), ["ALLOWED", "BLOCKED", "REJECTED"]);
    const [allowed, blocked, disputed] = run.receipts;
    assert.deepEqual(allowed.data, expectedMargins);
    assert.equal(blocked.data, null);
    assert.equal(disputed.data, null);
    assert.equal(disputed.actionTime, blocked.actionTime);
    for (const [i, receipt] of run.receipts.entries()) {
      assert.equal(receipt.source, "forced");
      assert.equal(receipt.agentId, AGENT_ID);
      assert.equal(receipt.kind, i === 2 ? "dispute" : "action");
      assert.equal(receipt.mandateId, i === 2 ? AMENDED_MANDATE_ID : MANDATE_ID);
      assert.equal(receipt.action, i === 0 ? consulting.allowed.name : consulting.forbidden.name);
      assert.deepEqual(receipt.checks.map((check) => check.id), ["signed", "agent", "valid", "stamped", "scope"]);
      assert.deepEqual(receipt.checks.filter((check) => !check.pass).map((check) => check.id),
        i === 0 ? [] : i === 1 ? ["scope"] : ["stamped"]);
    }
    t.diagnostic(`Actual current-main OFFLINE compatibility run ${index + 1}, ${run.ms} ms: ${JSON.stringify(run.body)}`);
  }
  assert.equal(new Set(report.runs.flatMap((run) => run.stampHashes)).size, 4,
    "The second reset must not reuse retained original/amendment results from the first run.");
});
