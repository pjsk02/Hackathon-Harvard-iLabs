// Isolated HTTP scaffold tests. No live signing/model routes or network calls.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { API_JSON_LIMIT_BYTES, errorHandler, httpError, parseApiJson, validateReportBody } from "./http";
import { BUSY_MESSAGE, createDemoGuard, OPERATION_HEADER, SESSION_HEADER, STALE_MESSAGE } from "./demo-guard";
import { captureResetGeneration, stateRouter } from "./routes/state";
import * as state from "./state";

beforeEach(() => state.reset());
const post = (body: unknown, session?: string) => ({
  method: "POST", headers: { "Content-Type": "application/json", ...(session ? { [SESSION_HEADER]: session } : {}) },
  body: JSON.stringify(body),
});
function scaffold(options?: Parameters<typeof createDemoGuard>[0]) {
  const app = express();
  app.use(parseApiJson());
  app.use("/api", createDemoGuard(options), validateReportBody, captureResetGeneration);
  app.use(stateRouter);
  return app;
}
async function serve(app: ReturnType<typeof express>, work: (base: string) => Promise<void>) {
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
  try { await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("advertised multibyte and maximally JSON-escaped text reaches the handler intact", async () => {
  const app = scaffold();
  app.post("/api/agent/run", (req, res) => res.json(req.body));
  await serve(app, async (base) => {
    for (const text of ["字".repeat(60_000), "🧪".repeat(30_000), "\u0001".repeat(60_000)]) {
      const body = { reportId: "poisoned", upload: { fileName: "多语言.txt", text } };
      assert.ok(Buffer.byteLength(JSON.stringify(body)) > 100_000);
      const response = await fetch(`${base}/api/agent/run`, post(body));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), body);
    }
  });
});

test("overlong text, oversized JSON and malformed uploads return clear errors before the owner handler", async () => {
  const app = scaffold();
  let called = 0;
  app.post("/api/agent/run", (_req, res) => { called++; res.json({ ok: true }); });
  await serve(app, async (base) => {
    for (const [body, status, message] of [
      [{ upload: { fileName: "report.txt", text: "字".repeat(60_001) } }, 413, /60,000/],
      [{ upload: { fileName: "report.txt", text: "x".repeat(API_JSON_LIMIT_BYTES) } }, 413, /too large/],
      [{ upload: { fileName: "report.txt", text: 123 } }, 400, /readable text/],
      [{ upload: { fileName: "report.pdf", text: "report" } }, 400, /supported report/],
      [{ upload: { fileName: "report.txt", text: " \n " } }, 400, /no readable text/],
    ] as const) {
      const response = await fetch(`${base}/api/agent/run`, post(body));
      assert.equal(response.status, status);
      assert.match((await response.json()).error, message);
    }
    assert.equal(called, 0);
  });
});

test("another visitor cannot mutate or reset an active request, even after its browser disconnects", async () => {
  const app = scaffold();
  let resume!: () => void;
  let started!: () => void;
  let disconnected!: () => void;
  let settled!: () => void;
  const gate = new Promise<void>((resolve) => { resume = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const closed = new Promise<void>((resolve) => { disconnected = resolve; });
  const done = new Promise<void>((resolve) => { settled = resolve; });
  app.post("/api/slips", async (_req, res) => {
    res.once("close", disconnected);
    started();
    await gate;
    res.json({ ok: true });
    settled();
  });
  app.post("/api/agent/run", (_req, res) => res.json({ ok: true }));
  await serve(app, async (base) => {
    const session = state.getSessionId();
    const controller = new AbortController();
    const first = fetch(`${base}/api/slips`, { ...post({}, session), signal: controller.signal }).catch(() => null);
    try {
      await ready;
      for (const route of ["/api/agent/run", "/api/reset"]) {
        const response = await fetch(`${base}${route}`, post({}, session));
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: BUSY_MESSAGE });
      }
      const status = await fetch(`${base}/api/state`);
      assert.equal(status.headers.get(OPERATION_HEADER), "busy");
      assert.equal(status.headers.get(SESSION_HEADER), session);
      controller.abort();
      await first;
      await closed;
      assert.equal((await fetch(`${base}/api/reset`, post({}))).status, 409);
      assert.equal(state.getSessionId(), session);
      resume();
      await done;
      const reset = await fetch(`${base}/api/reset`, post({}, session));
      assert.equal(reset.status, 200);
      assert.notEqual(reset.headers.get(SESSION_HEADER), session);
    } finally { resume(); }
  });
});

test("reset changes the authoritative identity; stale browser writes are refused and reads never mutate", async () => {
  const app = scaffold();
  let called = 0;
  app.post("/api/act", (_req, res) => { called++; res.json({ ok: true }); });
  await serve(app, async (base) => {
    const first = await fetch(`${base}/api/state`);
    const session = first.headers.get(SESSION_HEADER)!;
    assert.equal(first.headers.get("cache-control"), "no-store");
    const reset = await fetch(`${base}/api/reset`, post({}, session));
    assert.equal(reset.status, 200);
    const stale = await fetch(`${base}/api/act`, post({}, session));
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: STALE_MESSAGE });
    assert.equal(called, 0);
    assert.equal(state.getCounter(), 0);
    assert.notEqual((await fetch(`${base}/api/state`)).headers.get(SESSION_HEADER), session);
  });
});

test("async errors release the lock; costly GETs are limited and Reset does not refill the limit", async () => {
  let clock = 1_000;
  const app = scaffold({ maxPerMinute: 2, now: () => clock });
  app.get("/api/selftest", async () => { await Promise.resolve(); throw httpError(501, "The self-test is not built yet."); });
  app.get("/api/agent/eval", (_req, res) => res.json({ ok: true }));
  await serve(app, async (base) => {
    assert.equal((await fetch(`${base}/api/selftest`)).status, 501);
    assert.equal((await fetch(`${base}/api/agent/eval`)).status, 200);
    const limited = await fetch(`${base}/api/agent/eval`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal((await fetch(`${base}/api/reset`, post({}))).status, 200);
    assert.equal((await fetch(`${base}/api/agent/eval`)).status, 429);
    clock += 60_000;
    assert.equal((await fetch(`${base}/api/agent/eval`)).status, 200);
  });
});
