// Current-main P1 cryptography with an explicit mock ledger, never live finality.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Wallet } from "ethers";
import { once } from "node:events";
import express from "express";
import type { Receipt, Slip } from "../../../shared/contract";
import { AGENT_ID } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { buildMandate, signMandate } from "../../chain/slip";
import * as mockLedger from "../../chain/mockLedger";
import * as state from "../../state";
import { createEvaluator, evaluate, evaluateAtReference } from "../checks";
import { act, createGateway } from "../gateway";
import { actRouter, parseActRequest } from "../../routes/act";
import { agentRouter, parseEvalQuery, parseRunBody } from "../../routes/agent";
import { errorHandler } from "../../http";

// Ephemeral, unfunded fixture material, never read from workspace secrets or logged.
process.env.ISSUER_PRIVATE_KEY = Wallet.createRandom().privateKey;
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });

async function fixture(id: string, changes = {}): Promise<Slip> {
  const mandate = { ...buildMandate({
    scenarioId: consulting.id, allowedActions: [consulting.allowed.name], mandateId: id,
  }), ...changes };
  const signed = await signMandate(mandate);
  return { mandate, ...signed, label: "Original", anchor: await mockLedger.anchor(signed.digest) };
}

test("compatibility evaluator: five rows, caller/issuer/resource/scenario binding, recomputed digest", async () => {
  assert.equal(process.env.MOCK_CHAIN, "1", "Run this isolated suite with MOCK_CHAIN=1.");
  const slip = await fixture("checks");
  const at = await mockLedger.latestReference();
  const failed = async (candidate: Slip, caller = AGENT_ID) =>
    (await evaluateAtReference(candidate, consulting.allowed.name, await mockLedger.latestReference(), caller))
      .filter((c) => !c.pass).map((c) => c.id);
  const valid = await evaluateAtReference(slip, consulting.allowed.name, at);
  assert.deepEqual(valid.map((c) => c.id), ["signed", "agent", "valid", "stamped", "scope"]);
  assert.deepEqual(await failed(slip), []);
  assert.deepEqual(await failed(slip, "wrong-agent"), ["agent"]);
  assert.ok((await failed({ ...slip, mandate: { ...slip.mandate, issuer: Wallet.createRandom().address } })).includes("signed"));
  assert.deepEqual(await failed(await fixture("wrong-resource", { resource: "other" })), ["scope"]);
  assert.deepEqual(await failed(await fixture("wrong-scenario", { scenarioId: "other" })), ["scope"]);
  assert.deepEqual(await failed({ ...slip, digest: "untrusted supplied digest" }), ["stamped"]);
  const tampered = { ...slip, mandate: { ...slip.mandate, resource: "tampered" } };
  assert.ok((await failed(tampered)).includes("stamped"));
  assert.deepEqual(await failed(await fixture("expired", { expiresAt: at.blockTimestamp })), ["valid"]);
  assert.deepEqual(await failed({ ...slip, anchor: null }), ["stamped"]);
});

test("gateway mock compatibility: margins copy isolation; blocked salaries and unknown actions return null", async () => {
  const slip = await fixture("gateway");
  state.addSlip(slip);
  const request = { agentId: AGENT_ID, mandateId: slip.mandate.mandateId, action: consulting.allowed.name };
  const allowed = await act(request, "forced");
  assert.equal(allowed.decision, "ALLOWED");
  assert.equal((allowed.data as unknown[]).length, 4);
  const original = JSON.stringify(allowed.data);
  (allowed.data as { region: string }[])[0].region = "changed in receipt";
  assert.equal(JSON.stringify((await act(request, "forced")).data), original);
  const denied = await act({ ...request, action: consulting.forbidden.name }, "forced");
  assert.equal(denied.decision, "BLOCKED");
  assert.equal(denied.data, null);
  assert.deepEqual(denied.checks.filter((c) => !c.pass).map((c) => c.id), ["scope"]);
  const unknown = await fixture("unknown", { allowedActions: ["unknown"] });
  state.addSlip(unknown);
  const result = await act({ ...request, mandateId: "unknown", action: "unknown" }, "forced");
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.data, null);
});

test("verification outage is an operational error and adds no policy receipt", async () => {
  const slip = await fixture("outage");
  state.addSlip(slip);
  const count = state.listReceipts().length;
  const unavailable = createGateway({
    latestReference: mockLedger.latestReference,
    evaluate: createEvaluator({ lookup: async () => { throw new Error("offline verification outage"); } }),
  });
  await assert.rejects(
    unavailable({ agentId: AGENT_ID, mandateId: "outage", action: consulting.allowed.name }, "forced"),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 503,
  );
  assert.equal(state.listReceipts().length, count);
});

test("strict action/report/eval parsers reject malformed and costly ambiguous inputs", () => {
  for (const body of [null, [], 1, {}, { agentId: {}, mandateId: "m", action: "a" },
    { agentId: "a", mandateId: "m", action: ["a"] }, { agentId: " a", mandateId: "m", action: "a" }]) {
    assert.throws(() => parseActRequest(body));
  }
  assert.deepEqual(parseActRequest({ agentId: "a", mandateId: "m", action: "x", extra: true }),
    { agentId: "a", mandateId: "m", action: "x" });
  assert.equal(parseRunBody({ reportId: "clean" }), "clean");
  for (const body of [null, [], { reportId: ["clean"] }, { reportId: "other" }]) {
    assert.throws(() => parseRunBody(body));
  }
  assert.deepEqual(parseEvalQuery({}), { n: 10, reportId: "poisoned" });
  for (const n of ["0", "21", "1.5", "-1", "NaN", "1e1", ["1", "2"], {}]) {
    assert.throws(() => parseEvalQuery({ n }));
  }
  assert.throws(() => parseEvalQuery({ reportId: ["clean", "poisoned"] }));
  assert.deepEqual(parseEvalQuery({ n: "20", reportId: "clean" }), { n: 20, reportId: "clean" });
});

test("HTTP route errors retain contract shape and never call the model or write receipts", async () => {
  const app = express();
  app.use(express.json(), actRouter, agentRouter, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const count = state.listReceipts().length;
  try {
    for (const [path, body, status] of [
      ["/api/act", { agentId: {}, mandateId: "m", action: "a" }, 400],
      ["/api/act", { agentId: AGENT_ID, mandateId: "missing", action: consulting.allowed.name }, 404],
      ["/api/agent/run", { reportId: ["poisoned"] }, 400],
      ["/api/agent/run", { reportId: "clean" }, 409],
    ] as const) {
      const response = await fetch(`${base}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(response.status, status);
      const error = await response.json() as { error: string };
      assert.deepEqual(Object.keys(error), ["error"]);
      assert.equal(typeof error.error, "string");
    }
    for (const query of ["n=1.5", "n=21", "n=1&n=2", "reportId=other"]) {
      const response = await fetch(`${base}/api/agent/eval?${query}`);
      assert.equal(response.status, 400);
      assert.deepEqual(Object.keys(await response.json() as object), ["error"]);
    }
    assert.equal(state.listReceipts().length, count);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("act HTTP body cannot choose an agent source or override the actual caller passed to evaluate", async () => {
  const slip = await fixture("source-binding");
  state.addSlip(slip);
  const app = express();
  app.use(express.json(), actRouter, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    for (const agentId of [AGENT_ID, "wrong-actual-caller"]) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/act`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId, mandateId: slip.mandate.mandateId, action: consulting.allowed.name,
          source: "agent", // Not part of ActRequest; must not influence the trusted server source.
        }),
      });
      assert.equal(response.status, 200);
      const receipt = await response.json() as Receipt;
      assert.equal(receipt.source, "forced");
      assert.equal(receipt.agentId, agentId);
      assert.equal(receipt.decision, agentId === AGENT_ID ? "ALLOWED" : "BLOCKED");
      assert.deepEqual(receipt.checks.filter((check) => !check.pass).map((check) => check.id),
        agentId === AGENT_ID ? [] : ["agent"]);
      if (agentId !== AGENT_ID) assert.equal(receipt.data, null);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("existing P1 four-argument evaluator works; malformed supplied context is rejected", async () => {
  const slip = await fixture("replay-compatibility");
  const normal = await evaluate(slip, consulting.allowed.name, slip.anchor!.blockTimestamp, AGENT_ID);
  assert.ok(normal.every((check) => check.pass));
  for (const context of [null, {}, { requestBlock: await mockLedger.latestReference() }]) {
    await assert.rejects(evaluate(slip, consulting.forbidden.name, slip.anchor!.blockTimestamp, AGENT_ID, context),
      { status: 503, message: "The original request context could not be verified." });
  }
});
