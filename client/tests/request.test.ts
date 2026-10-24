import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createRequester, plainError } from "../src/request";
import { isHealth, isRun, isState } from "../src/api-contract";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const unknown = (error: unknown) => error instanceof ApiError && error.outcomeUnknown;

test("a timed-out action is sent once, stays unconfirmed, and blocks new writes", async () => {
  let calls = 0;
  const transport = createRequester({ actionTimeoutMs: 5, fetcher: async () => { calls++; return new Promise<Response>(() => {}); } });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }), unknown);
  assert.equal(calls, 1);
  assert.equal(transport.pendingAction()?.phase, "unconfirmed");
  await assert.rejects(transport.request("/api/slips", { method: "POST" }), unknown);
  assert.equal(calls, 1);
});

test("the response-body read is also bounded by the deadline", async () => {
  const transport = createRequester({ actionTimeoutMs: 5, fetcher: async () =>
    ({ ok: true, json: () => new Promise(() => {}) }) as unknown as Response });
  await assert.rejects(transport.request("/api/act", { method: "POST" }), unknown);
});

test("network loss after a write is not treated as cancellation", async () => {
  const transport = createRequester({ fetcher: async () => { throw new TypeError("network"); } });
  await assert.rejects(transport.request("/api/dispute", { method: "POST" }), unknown);
  assert.equal(transport.pendingAction()?.path, "/api/dispute");
});

test("a failed read does not lock subsequent writes", async () => {
  const transport = createRequester({ fetcher: async () => { throw new TypeError("network"); } });
  await assert.rejects(transport.request("/api/state"), /Could not reach the server/);
  assert.equal(transport.pendingAction(), null);
});

test("unreadable or incomplete success responses are explicit errors", async () => {
  for (const response of [new Response("<html>upstream error</html>"), json(null), json({ ok: true })]) {
    const transport = createRequester({ fetcher: async () => response });
    await assert.rejects(transport.request("/api/slips", { method: "POST", validate: (_): _ is never => false }), unknown);
  }
});

test("known unbuilt-service errors stay visible and do not invent an in-flight write", async () => {
  const transport = createRequester({ fetcher: async () => json({ error: "The Monad connection is not built yet. Set MOCK_CHAIN=1 to use the mock." }, 502) });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }),
    (error: unknown) => error instanceof ApiError && error.message === "The Monad connection is not built yet." && !error.outcomeUnknown);
  assert.equal(transport.pendingAction(), null);
});

test("other server failures conservatively retain the unconfirmed action", async () => {
  const transport = createRequester({ fetcher: async () => json({ error: "Monad did not confirm the public record." }, 503) });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }), unknown);
});

test("P1's explicit paused-send limit is a setup failure, not an uncertain submission", async () => {
  const transport = createRequester({ fetcher: async () => json({ error: "Real Monad transactions are paused until a test limit is approved." }, 503) });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }),
    (error: unknown) => error instanceof ApiError && !error.outcomeUnknown && /records are paused/.test(error.message));
  assert.equal(transport.pendingAction(), null);
});

test("concurrent clicks issue only one request and successful replies clear the guard", async () => {
  let finish!: (response: Response) => void;
  let calls = 0;
  const transport = createRequester({ fetcher: () => { calls++; return new Promise<Response>((resolve) => { finish = resolve; }); } });
  const first = transport.request("/api/slips", { method: "POST" });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }), unknown);
  finish(json({ ok: true }));
  await first;
  assert.equal(calls, 1);
  assert.equal(transport.pendingAction(), null);
});

test("reload restores waiting work as unconfirmed rather than silently retrying", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let finish!: (response: Response) => void;
  const first = createRequester({ storage, fetcher: () => new Promise((resolve) => { finish = resolve; }) });
  const request = first.request("/api/slips", { method: "POST", label: "Permission request" });
  const restored = createRequester({ storage });
  assert.deepEqual(restored.pendingAction(), { path: "/api/slips", label: "Permission request", phase: "unconfirmed" });
  restored.confirmGrant();
  assert.equal(restored.pendingAction(), null);
  finish(json({ ok: true }));
  await request;
});

test("checking state does not clear an uncertain agent run; confirmed Reset does", async () => {
  const transport = createRequester({ fetcher: async (url) => {
    if (url === "/api/agent/run") throw new Error("lost reply");
    return json({ ok: true });
  } });
  await assert.rejects(transport.request("/api/agent/run", { method: "POST" }), unknown);
  await transport.request("/api/state");
  transport.confirmGrant();
  assert.equal(transport.pendingAction()?.path, "/api/agent/run");
  await transport.request("/api/reset", { method: "POST" });
  assert.equal(transport.pendingAction(), null);
});

test("a rejected Reset preserves the original recovery guard", async () => {
  const transport = createRequester({ fetcher: async (url) => {
    if (url === "/api/act") throw new Error("lost reply");
    return json({ error: "Reset is unavailable." }, 409);
  } });
  await assert.rejects(transport.request("/api/act", { method: "POST" }), unknown);
  await assert.rejects(transport.request("/api/reset", { method: "POST" }), /Reset is unavailable/);
  assert.equal(transport.pendingAction()?.path, "/api/act");
});

test("the GET self-test is guarded because it can create real records", async () => {
  const transport = createRequester({ fetcher: async () => { throw new Error("lost reply"); } });
  await assert.rejects(transport.request("/api/selftest", { mutates: true }), unknown);
  assert.equal(transport.pendingAction()?.path, "/api/selftest");
});

test("public errors shorten record identifiers and omit obsolete mock advice", () => {
  assert.equal(plainError(`Transaction: 0x${"a".repeat(64)}`), "Public record: 0xaaaaaa…aaaaaa");
});

test("shape checks reject malformed health, model and state replies", () => {
  assert.equal(isHealth({ ok: "true", mockChain: false, issuer: null, rpc: "network" }), false);
  assert.equal(isHealth({ ok: true, mockChain: false, issuer: null, rpc: "network" }), true);
  assert.equal(isRun({ transcript: null, proposedCalls: [], receipts: [] }), false);
  assert.equal(isRun({ transcript: "No data requested.", proposedCalls: [], receipts: [] }), true);
  assert.equal(isState({ scenario: {}, slips: [], receipts: [], counter: 0 }), false);
});
