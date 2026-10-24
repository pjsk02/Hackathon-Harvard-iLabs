import assert from "node:assert/strict";
import { test } from "node:test";
import { createPresentationStore } from "../src/presentation-store";
import { consulting } from "../../shared/scenarios";
import type { Receipt, StateResponse } from "../../shared/contract";
import { permission } from "./ui-harness";

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};
const state = (): StateResponse => ({ scenario: consulting, slips: [structuredClone(permission)], receipts: [], counter: 0 });
const upload = { kind: "upload" as const, fileName: "kept.txt", text: "Visible\n\nHidden",
  parts: [{ text: "Visible", hidden: false }, { text: "Hidden", hidden: true }] };

test("upload and real completed-run references survive remount/reload only in the same server session", () => {
  const storage = memory();
  const original = createPresentationStore(storage);
  const data = state();
  data.receipts = [{ id: "r_001" } as Receipt];
  original.acceptState("session-one", data);
  original.attach(upload);
  original.completed("clean", data.receipts);
  original.setStep(3);
  const restored = createPresentationStore(storage);
  assert.equal(restored.getSnapshot().sessionId, null);
  assert.equal(restored.getSnapshot().injectedUpload, null);
  restored.acceptState("session-one", data);
  assert.deepEqual(restored.getSnapshot().injectedUpload, upload);
  assert.deepEqual(restored.getSnapshot().examples.clean?.receiptIds, ["r_001"]);
  assert.equal(restored.getSnapshot().activeStep, 3);
  restored.acceptState("reset-session", { ...data, slips: [], receipts: [] });
  assert.equal(restored.getSnapshot().injectedUpload, null);
  assert.equal(restored.getSnapshot().examples.clean, null);
  assert.equal(restored.getSnapshot().activeStep, 1);
});

test("reused receipt IDs after restart cannot restore old uploads/progress", () => {
  const storage = memory();
  const data = state();
  data.receipts = [{ id: "r_001" } as Receipt];
  const original = createPresentationStore(storage);
  original.acceptState("before-restart", data);
  original.attach(upload);
  original.completed("poisoned", data.receipts);
  const restored = createPresentationStore(storage);
  restored.acceptState("after-restart", data);
  assert.equal(restored.getSnapshot().injectedUpload, null);
  assert.equal(restored.getSnapshot().examples.poisoned, null);
});

test("missing receipts or a changed permission invalidate completion; a model refusal needs no fake receipt", () => {
  const store = createPresentationStore(memory());
  const data = state();
  data.receipts = [{ id: "r_001" } as Receipt];
  store.acceptState("one-session", data);
  store.completed("clean", data.receipts);
  store.acceptState("one-session", { ...data, receipts: [] });
  assert.equal(store.getSnapshot().examples.clean, null);
  store.completed("clean", []);
  store.acceptState("one-session", { ...data, receipts: [] });
  assert.deepEqual(store.getSnapshot().examples.clean?.receiptIds, []);
  data.slips[0].digest = "changed-permission";
  store.acceptState("one-session", data);
  assert.equal(store.getSnapshot().examples.clean, null);
});

test("switching to clean keeps the injected upload; storage failures are explicit and never start work", () => {
  const store = createPresentationStore({
    getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {},
  });
  store.acceptState("one-session", state());
  store.attach(upload);
  store.selectReport("clean");
  assert.equal(store.getSnapshot().attached.kind, "builtin");
  store.selectReport("poisoned");
  assert.deepEqual(store.getSnapshot().attached, upload);
  assert.match(store.getSnapshot().storageWarning!, /could not save/);
});
