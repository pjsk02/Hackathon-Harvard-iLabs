import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequester, ApiError } from "../src/request";
import { api } from "../src/api";
import { attemptReceipt } from "./attempt-fixtures";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("act/run create one UUID v4 per action, attach cookies, and use fresh identities for later actions", async () => {
  const keys: string[] = [];
  const requester = createRequester({ fetcher: async (_url, options) => {
    keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
    assert.equal(options?.credentials, "include");
    return json({ ok: true });
  } });
  for (const path of ["/api/act", "/api/agent/run", "/api/act"]) await requester.request(path, { method: "POST", body: {} });
  assert.ok(keys.every((key) => uuid.test(key)));
  assert.equal(new Set(keys).size, 3);
});

test("uncertain identity survives reload and read-only reconciliation, with no repeat of unknown work", async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v); },
    removeItem: (k: string) => { saved.delete(k); } };
  let calls = 0;
  const requester = createRequester({ storage, fetcher: async () => { calls++; throw new Error("Lost reply"); } });
  await assert.rejects(requester.request("/api/agent/run", { method: "POST", body: { reportId: "clean" } }), (e: unknown) => e instanceof ApiError && e.outcomeUnknown);
  const identity = requester.pendingAction()!.idempotencyKey!;
  assert.match(identity, uuid);
  const restored = createRequester({ storage, fetcher: async (_url, options) => {
    calls++;
    assert.equal(new Headers(options?.headers).has("Idempotency-Key"), false);
    return json(attemptReceipt());
  } });
  assert.equal(restored.pendingAction()!.idempotencyKey, identity);
  await restored.request("/api/attempts/521694b4-320e-4c1b-98ab-c0778765a432/reconcile", { method: "POST", mutates: false });
  assert.equal(restored.pendingAction()!.idempotencyKey, identity);
  await restored.request("/api/state");
  await assert.rejects(restored.request("/api/agent/run", { method: "POST", body: { reportId: "clean" } }), /earlier action/);
  assert.equal(calls, 3);
  assert.ok(![...saved.values()].some((value) => value.includes("reportId")));
});

test("API recheck is read-only POST, validates receipt identity, and self-test uses explicit POST", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; method: string | undefined }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method });
    if (String(url) === "/api/selftest") return json({ pass: true, steps: [] });
    return json(attemptReceipt());
  };
  try {
    const id = attemptReceipt().attemptEvidence!.record.attemptId;
    assert.equal((await api.reconcile(id, "r_001")).id, "r_001");
    assert.equal(api.pendingAction(), null);
    await assert.rejects(api.reconcile(id, "r_002"), /incomplete response/);
    assert.equal(api.pendingAction(), null);
    await api.selftest();
    assert.deepEqual(calls, [
      { url: `/api/attempts/${id}/reconcile`, method: "POST" },
      { url: `/api/attempts/${id}/reconcile`, method: "POST" },
      { url: "/api/selftest", method: "POST" },
    ]);
  } finally { globalThis.fetch = original; }
});

test("GET selftest is a read and does not create an uncertain-action guard", async () => {
  const requester = createRequester({ fetcher: async () => { throw new Error("Unavailable"); } });
  await assert.rejects(requester.request("/api/selftest"), /Could not reach/);
  assert.equal(requester.pendingAction(), null);
});
