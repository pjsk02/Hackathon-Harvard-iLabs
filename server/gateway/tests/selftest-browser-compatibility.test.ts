// P2 compatibility tests use P3's actual browser requester and HTTP guard
// unchanged. These ephemeral offline servers are not the running demo.
import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { ApiError, createRequester } from "../../../client/src/request";
import { createDemoGuard } from "../../demo-guard";
import { errorHandler, httpError, parseApiJson } from "../../http";
import { captureResetGeneration, stateRouter } from "../../routes/state";
import { createSelftestRouter, ISOLATION_UNAVAILABLE, selftestRouter, type SelftestSession } from "../../routes/selftest";
import * as state from "../../state";
import { deferred, withTestApp } from "./reset-fixtures";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
function snapshot() {
  return structuredClone({
    generation: state.getGeneration(), session: state.getSessionId(),
    slips: state.listSlips(), receipts: state.listReceipts(), counter: state.getCounter(),
  });
}
function appWith(router: ReturnType<typeof createSelftestRouter>, onAction: () => void) {
  const app = express();
  app.use(parseApiJson());
  app.use("/api", createDemoGuard(), captureResetGeneration);
  app.use(stateRouter, router);
  // Test-only successful receiver: prove browser/server admission after refusal.
  // Actual action enforcement/data are covered by the full compatibility suite.
  app.post("/api/act", (_req, res) => { onAction(); res.json({ fixture: true }); });
  app.use(errorHandler);
  return app;
}
const unknownOutcome = (error: unknown) => error instanceof ApiError && error.outcomeUnknown;

test("mounted unavailable self-test leaves no browser recovery record, survives reload and admits the next action without Reset", async () => {
  const before = snapshot();
  const storage = memoryStorage();
  const traffic: string[] = [];
  let actions = 0;
  await withTestApp(appWith(selftestRouter, () => { actions++; }), async (base) => {
    const fetcher: typeof fetch = (url, options) => {
      traffic.push(`${options?.method ?? "GET"} ${String(url)}`);
      return fetch(`${base}${String(url)}`, options);
    };
    const transport = createRequester({ storage, fetcher, getSessionId: state.getSessionId });
    const phases: (string | null)[] = [];
    transport.subscribeToPending(() => phases.push(transport.pendingAction()?.phase ?? null));
    for (let i = 0; i < 2; i++) {
      await assert.rejects(transport.request("/api/selftest", { mutates: true, label: "Self-test" }),
        (error: unknown) => error instanceof ApiError &&
          !error.outcomeUnknown && error.message === ISOLATION_UNAVAILABLE);
      assert.equal(transport.pendingAction(), null);
      assert.equal(storage.values.size, 0, "No persisted unconfirmed action may survive a definite no-work refusal.");
    }
    assert.deepEqual(phases, ["waiting", null, "waiting", null]);
    const reloaded = createRequester({ storage, fetcher, getSessionId: state.getSessionId });
    assert.equal(reloaded.pendingAction(), null);
    await reloaded.request("/api/act", { method: "POST", label: "Test next action" });
    assert.equal(actions, 1);
    assert.equal(reloaded.pendingAction(), null);
    assert.equal(storage.values.size, 0);
  });
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(traffic, ["GET /api/selftest", "GET /api/selftest", "POST /api/act"]);
  assert.ok(!traffic.some((request) => request.includes("/api/reset")));
});

test("a registered factory failure cannot masquerade as the known pre-admission 501; the browser keeps it unconfirmed", async () => {
  const storage = memoryStorage();
  const before = snapshot();
  let admissions = 0;
  let actions = 0;
  const router = createSelftestRouter({
    createIsolatedSession: async () => {
      admissions++;
      // After entry, work may already have happened. Even this exact child
      // error must be sanitized to 503 rather than becoming a no-work promise.
      throw httpError(501, ISOLATION_UNAVAILABLE);
    },
  });
  await withTestApp(appWith(router, () => { actions++; }), async (base) => {
    const fetcher: typeof fetch = (url, options) => fetch(`${base}${String(url)}`, options);
    const transport = createRequester({ storage, fetcher });
    await assert.rejects(transport.request("/api/selftest", { mutates: true }), unknownOutcome);
    assert.equal(admissions, 1);
    assert.equal(transport.pendingAction()?.phase, "unconfirmed");
    await transport.request("/api/state");
    assert.equal(transport.pendingAction()?.path, "/api/selftest");
    const reloaded = createRequester({ storage, fetcher });
    assert.equal(reloaded.pendingAction()?.phase, "unconfirmed");
    await assert.rejects(reloaded.request("/api/act", { method: "POST" }), unknownOutcome);
    assert.equal(actions, 0);
  });
  assert.deepEqual(snapshot(), before);
});

test("a real self-test HTTP deadline remains unconfirmed in the browser, keeps the server lock and admits no late child reset", async () => {
  const storage = memoryStorage();
  const before = snapshot();
  const release = deferred<SelftestSession>();
  const closed = deferred<void>();
  let actions = 0;
  let resets = 0;
  const router = createSelftestRouter({
    maximumMs: 30,
    createIsolatedSession: () => release.promise,
  });
  const mustNotRun = async (): Promise<never> => { throw new Error("A timed-out factory must not admit a child."); };
  const session: SelftestSession = {
    evidence: "offline-fixture",
    close: async () => { closed.resolve(); },
    client: {
      reset: async () => { resets++; },
      createSlip: mustNotRun, act: mustNotRun, dispute: mustNotRun,
      getSlip: () => undefined, verifyStamp: mustNotRun,
    },
  };
  await withTestApp(appWith(router, () => { actions++; }), async (base) => {
    const fetcher: typeof fetch = (url, options) => fetch(`${base}${String(url)}`, options);
    const transport = createRequester({ storage, fetcher, actionTimeoutMs: 2000 });
    try {
      await assert.rejects(transport.request("/api/selftest", { mutates: true }), unknownOutcome);
      assert.equal(transport.pendingAction()?.phase, "unconfirmed");
      await transport.request("/api/state");
      const reloaded = createRequester({ storage, fetcher });
      await assert.rejects(reloaded.request("/api/act", { method: "POST" }), unknownOutcome);
      assert.equal(actions, 0);
      const locked = await fetch(`${base}/api/selftest`);
      assert.equal(locked.status, 409);
      await locked.json();
    } finally {
      release.resolve(session);
      await closed.promise;
    }
    assert.equal(resets, 0);
    assert.equal(transport.pendingAction()?.phase, "unconfirmed");
  });
  assert.deepEqual(snapshot(), before);
});
