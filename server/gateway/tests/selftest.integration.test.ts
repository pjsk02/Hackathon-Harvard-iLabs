// Named router/failure tests and offline orchestration, NOT integrated live proof.
// Positive scenes inject replay; both delivered-context regressions remain TODO.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Wallet } from "ethers";
import express from "express";
import type { SelftestResponse } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { createSelftestRouter, ISOLATION_UNAVAILABLE, runSelftest, selftestRouter } from "../../routes/selftest";
import { errorHandler, httpError } from "../../http";
import * as shared from "../../state";
import { deferred, receiptInput, slip, withTestApp } from "./reset-fixtures";
import { selftestFixture } from "./selftest-fixtures";

process.env.ISSUER_PRIVATE_KEY = Wallet.createRandom().privateKey;
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });

const sharedSnapshot = () => structuredClone({
  generation: shared.getGeneration(), slips: shared.listSlips(),
  receipts: shared.listReceipts(), counter: shared.getCounter(),
});
function appFor(router: express.Router) {
  const app = express();
  app.use(router, errorHandler);
  return app;
}

test("existing named selftestRouter returns explicit 503; zero shared reset, mutation or child HTTP calls", async () => {
  shared.addSlip(slip);
  shared.addReceipt(receiptInput());
  const before = sharedSnapshot();
  const trace: string[] = [];
  const app = express();
  app.use((req, _res, next) => { trace.push(req.path); next(); });
  app.use(selftestRouter, errorHandler);
  await withTestApp(app, async (base) => {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/api/selftest?mode=live&isolated=true`);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("X-Envoi-Selftest-Mode"), null);
      assert.deepEqual(await response.json(), { error: ISOLATION_UNAVAILABLE });
    }
  });
  assert.deepEqual(trace, ["/api/selftest", "/api/selftest"]);
  assert.deepEqual(sharedSnapshot(), before);
});

test("offline runner: two fresh isolated four-scene runs, real P1 issuance, injected replay, unchanged shared state", async (t) => {
  const before = sharedSnapshot();
  const instances: ReturnType<typeof selftestFixture>[] = [];
  const router = createSelftestRouter({
    createIsolatedSession: async () => {
      const fixture = selftestFixture();
      instances.push(fixture);
      return fixture.session;
    },
  });
  await withTestApp(appFor(router), async (base) => {
    for (let run = 0; run < 2; run++) {
      const response = await fetch(`${base}/api/selftest`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Envoi-Selftest-Mode"), "offline-fixture");
      const body = await response.json() as SelftestResponse;
      assert.deepEqual(Object.keys(body).sort(), ["pass", "steps"]);
      assert.equal(body.pass, true, JSON.stringify(body));
      t.diagnostic(`Complete OFFLINE FIXTURE response ${run + 1}: ${JSON.stringify(body)}`);
      assert.equal(body.steps.length, 4);
      assert.match(body.steps[0].got, /not live evidence/);
      assert.deepEqual(body.steps.map((step) => step.scene), [
        "1 Permission slip (offline-fixture)", "2a Regional margins", "2b Employee salaries", "3 Amended permission",
      ]);
      for (const step of body.steps) {
        assert.deepEqual(Object.keys(step).sort(), ["expected", "got", "ms", "scene"]);
        assert.equal(step.expected, step.got);
        assert.ok(Number.isInteger(step.ms) && step.ms >= 0 && step.ms < 30_000);
        t.diagnostic(`${step.scene}: ${step.ms} ms (offline; injected replay, not integrated evidence)`);
      }
      const fixture = instances[run];
      assert.deepEqual(fixture.trace, ["isolated reset", "original", consulting.allowed.name, consulting.forbidden.name, "injected replay"]);
      assert.deepEqual(fixture.receipts.map((receipt) => receipt.decision), ["ALLOWED", "BLOCKED", "REJECTED"]);
      assert.equal(fixture.generation(), 1);
      assert.deepEqual(fixture.counts, { margins: 1, salaries: 0, captures: 2, closed: 1 });
      assert.deepEqual(sharedSnapshot(), before);
    }
  });
  assert.notStrictEqual(instances[0].permissions, instances[1].permissions);
  assert.notStrictEqual(instances[0].slips, instances[1].slips);
});

test("runner failures are safe and stop subsequent scenes; paused sends/signing/evidence are not a pass", async () => {
  for (const stage of ["issuance", "readback", "scope", "dispute-readback"]) {
    const f = selftestFixture();
    if (stage === "issuance") f.session.client.createSlip = async () => { throw httpError(503, "private key / RPC details"); };
    if (stage === "readback") f.session.client.verifyStamp = async () => { throw httpError(503, "private provider endpoint"); };
    if (stage === "scope") {
      const act = f.session.client.act;
      f.session.client.act = async (action) => {
        const receipt = await act(action);
        if (action === consulting.forbidden.name) receipt.data = [{ leaked: true }];
        return receipt;
      };
    }
    if (stage === "dispute-readback") {
      const verify = f.session.client.verifyStamp;
      f.session.client.verifyStamp = async (slip) => {
        if (slip.label === "Amended") throw httpError(503, "private provider endpoint");
        await verify(slip);
      };
    }
    const result = await runSelftest(f.session.client);
    assert.equal(result.pass, false);
    assert.equal(result.steps.length, stage === "scope" ? 3 : stage === "dispute-readback" ? 4 : 1);
    assert.doesNotMatch(JSON.stringify(result), /private|provider endpoint|leaked/);
    assert.equal(f.counts.salaries, 0);
    if (stage !== "dispute-readback") assert.ok(!f.trace.includes("injected replay"));
  }
});

test("runner rejects wrong source, identity, order, data, frozen time and outage-as-late claims", async () => {
  for (const defect of ["source", "agent", "mandate", "action", "checks", "data", "time", "dispute-id", "outage"]) {
    const f = selftestFixture();
    if (["time", "dispute-id", "outage"].includes(defect)) {
      const dispute = f.session.client.dispute;
      f.session.client.dispute = async () => {
        const result = await dispute();
        if (defect === "time") result.actionTime++;
        if (defect === "dispute-id") result.mandateId = slip.mandate.mandateId;
        if (defect === "outage") result.checks[3].detail = "Could not reach Monad to verify the stamp.";
        return result;
      };
    } else {
      const act = f.session.client.act;
      f.session.client.act = async (action) => {
        const result = await act(action);
        if (defect === "source") result.source = "agent";
        if (defect === "agent") result.agentId = "not-atlas";
        if (defect === "mandate") result.mandateId = "not-requested";
        if (defect === "action") result.action = "not-requested";
        if (defect === "checks") result.checks.reverse();
        if (defect === "data") result.data = [{}, {}, {}, {}];
        return result;
      };
    }
    assert.equal((await runSelftest(f.session.client)).pass, false, defect);
    assert.equal(f.counts.salaries, 0);
  }
});

test("an anchor-shaped object without a genuine signature cannot pass the first scene", async () => {
  const f = selftestFixture();
  const issue = f.session.client.createSlip;
  f.session.client.createSlip = async () => {
    const original = await issue();
    original.signature = "0x";
    return original;
  };
  const result = await runSelftest(f.session.client);
  assert.equal(result.pass, false);
  assert.equal(result.steps.length, 1);
  assert.equal(f.counts.captures, 0);
  assert.equal(f.counts.margins, 0);
});

test("deadline keeps single-flight lock through unresolved child AND cleanup; delayed child cannot start more work", async () => {
  const before = sharedSnapshot();
  const entered = deferred<void>();
  const release = deferred<void>();
  const cleaning = deferred<void>();
  const cleaned = deferred<void>();
  const finished = deferred<void>();
  let runs = 0;
  const first = selftestFixture();
  first.session.client.reset = async () => { entered.resolve(); await release.promise; };
  first.session.close = async () => { cleaning.resolve(); await cleaned.promise; finished.resolve(); };
  const router = createSelftestRouter({
    maximumMs: 150,
    createIsolatedSession: async () => ++runs === 1 ? first.session : selftestFixture().session,
  });
  await withTestApp(appFor(router), async (base) => {
    const pending = fetch(`${base}/api/selftest`);
    await entered.promise;
    assert.equal((await fetch(`${base}/api/selftest`)).status, 409);
    const expired = await pending;
    assert.equal(expired.status, 504);
    assert.deepEqual(Object.keys(await expired.json() as object), ["error"]);
    assert.equal((await fetch(`${base}/api/selftest`)).status, 409, "HTTP timeout did not cancel the child.");
    release.resolve();
    await cleaning.promise;
    assert.equal((await fetch(`${base}/api/selftest`)).status, 409, "Cleanup must settle too.");
    cleaned.resolve();
    await finished.promise;
    const fresh = await fetch(`${base}/api/selftest`);
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json() as SelftestResponse).pass, true);
  });
  assert.deepEqual(first.trace, [], "The child released after timeout must not admit issuance.");
  assert.equal(first.slips.size, 0);
  assert.equal(first.receipts.length, 0);
  assert.deepEqual(sharedSnapshot(), before);
});

test("factory delayed past the deadline is closed without resetting or admitting ANY child", async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const finished = deferred<void>();
  const f = selftestFixture();
  f.session.close = async () => { finished.resolve(); };
  const router = createSelftestRouter({
    maximumMs: 50,
    createIsolatedSession: async () => { entered.resolve(); await release.promise; return f.session; },
  });
  const before = sharedSnapshot();
  await withTestApp(appFor(router), async (base) => {
    const pending = fetch(`${base}/api/selftest`);
    await entered.promise;
    assert.equal((await pending).status, 504);
    assert.equal((await fetch(`${base}/api/selftest`)).status, 409);
    release.resolve();
    await finished.promise;
  });
  assert.deepEqual(f.trace, []);
  assert.equal(f.slips.size, 0);
  assert.deepEqual(sharedSnapshot(), before);
});

test("failed scenes release the lock after cleanup and do not cache an earlier result", async () => {
  let runs = 0;
  const router = createSelftestRouter({
    createIsolatedSession: async () => {
      const f = selftestFixture();
      if (++runs === 1) f.session.client.createSlip = async () => { throw httpError(503, "paused fixture"); };
      return f.session;
    },
  });
  await withTestApp(appFor(router), async (base) => {
    const failed = await fetch(`${base}/api/selftest`);
    assert.equal(failed.status, 200);
    assert.equal((await failed.json() as SelftestResponse).pass, false);
    const fresh = await fetch(`${base}/api/selftest`);
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json() as SelftestResponse).pass, true);
  });
  assert.equal(runs, 2);
});

test("factory and cleanup failures have safe specific 503s and release the lock only after settling", async () => {
  for (const stage of ["factory", "cleanup"]) {
    let runs = 0;
    const router = createSelftestRouter({
      createIsolatedSession: async () => {
        const fail = ++runs === 1;
        if (fail && stage === "factory") throw httpError(503, "private credential-like provider detail");
        const f = selftestFixture();
        if (fail) f.session.close = async () => { throw new Error("private cleanup detail"); };
        return f.session;
      },
    });
    await withTestApp(appFor(router), async (base) => {
      const failed = await fetch(`${base}/api/selftest`);
      assert.equal(failed.status, 503);
      assert.deepEqual(await failed.json(), {
        error: "The isolated self-test session could not be prepared or released safely.",
      });
      const fresh = await fetch(`${base}/api/selftest`);
      assert.equal(fresh.status, 200);
      assert.equal((await fresh.json() as SelftestResponse).pass, true);
    });
    assert.equal(runs, 2);
  }
});

test("actual owner service retains the available next-second compatibility dispute without proposed context hooks", async () => {
  const f = selftestFixture();
  await f.session.client.reset();
  await f.session.client.createSlip();
  await f.session.client.act(consulting.forbidden.name);
  f.advanceSecond();
  const disputed = await f.permissions.replayDispute();
  assert.equal(disputed.decision, "REJECTED");
  assert.deepEqual(disputed.checks.filter((check) => !check.pass).map((check) => check.id), ["stamped"]);
  assert.equal(disputed.data, null);
  assert.equal(f.receipts.length, 2);
  assert.equal(f.receipts[0].decision, "BLOCKED");
  assert.equal(f.counts.salaries, 0);
});

// Retain, do not replace with tests against invented or merely proposed hooks.
test.todo("P1/P3 contract blocked: equal-time finalized blocks N/N+1/N+2 use retained original context; reject later/noncanonical/unfinalized evidence");
test.todo("P1/P3 contract blocked: finalized-reference capture or verification outage releases no data, substitutes no clock/latest/mock evidence, makes no verified claim");
