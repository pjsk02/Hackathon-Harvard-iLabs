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

test("only the exact known pre-tool AI failure unlocks Force", async () => {
  const transport = createRequester({ fetcher: async (url) => url === "/api/agent/run"
    ? json({ error: "The AI service did not answer. Use Force the request." }, 502)
    : json({ ok: true }) });
  await assert.rejects(transport.request("/api/agent/run", { method: "POST" }),
    (error: unknown) => error instanceof ApiError && !error.outcomeUnknown);
  assert.equal(transport.pendingAction(), null);
  await transport.request("/api/act", { method: "POST" });
  for (const [path, message] of [
    ["/api/agent/run", "The AI service failed after tool execution."],
    ["/api/agent/run", "A tool is not built yet."],
    ["/api/act", "The AI service did not answer. Use Force the request."],
  ]) {
    const uncertain = createRequester({ fetcher: async () => json({ error: message }, 502) });
    await assert.rejects(uncertain.request(path, { method: "POST" }), unknown);
    await assert.rejects(uncertain.request("/api/act", { method: "POST" }), unknown);
  }
});

test("ambiguous conflicts stay guarded; explicit shared-demo refusals can be checked without replay", async () => {
  const uncertain = createRequester({ fetcher: async () => json({ error: "The session changed after sending the record." }, 409) });
  await assert.rejects(uncertain.request("/api/slips", { method: "POST" }), unknown);
  for (const message of [
    "Another demo action is still being processed; check status before trying again.",
    "The shared demo changed; check status before starting this action.",
    "Another request is still being processed; check status before trying again.",
    "The shared session changed; check status before starting this action.",
  ]) {
    const refused = createRequester({ fetcher: async () => json({ error: message }, 409) });
    await assert.rejects(refused.request("/api/act", { method: "POST" }),
      (error: unknown) => error instanceof ApiError && !error.outcomeUnknown);
    assert.equal(refused.pendingAction(), null);
  }
});

test("current and older rate-limit messages remain explicit refusals with product wording", async () => {
  for (const error of [
    "Too many requests; wait one minute before trying again.",
    "Too many demo actions; wait one minute before trying again.",
  ]) {
    const transport = createRequester({ fetcher: async () => json({ error }, 429) });
    await assert.rejects(transport.request("/api/agent/run", { method: "POST" }),
      (cause: unknown) => cause instanceof ApiError && !cause.outcomeUnknown && !/\bdemo\b/i.test(cause.message));
    assert.equal(transport.pendingAction(), null);
  }
});

test("permission recovery is tied to the session that submitted it, not a later permission", async () => {
  let sent: Headers | undefined;
  const transport = createRequester({
    getSessionId: () => "original-session",
    fetcher: async (_url, options) => { sent = new Headers(options?.headers); throw new Error("lost"); },
  });
  await assert.rejects(transport.request("/api/slips", { method: "POST" }), unknown);
  assert.equal(sent?.get("X-Envoi-Session"), "original-session");
  transport.confirmGrant("later-session");
  assert.equal(transport.pendingAction()?.sessionId, "original-session");
  transport.confirmGrant("original-session");
  assert.equal(transport.pendingAction(), null);
});

test("a late response after the deadline cannot change the authoritative presentation", async () => {
  let finish!: (response: Response) => void;
  let adopted = false;
  const transport = createRequester({ readTimeoutMs: 5, fetcher: () => new Promise((resolve) => { finish = resolve; }) });
  await assert.rejects(transport.request("/api/state", { onSuccess: () => { adopted = true; } }), /in time/);
  finish(json({ ok: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adopted, false);
});
