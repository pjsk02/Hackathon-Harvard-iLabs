import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type Router } from "express";
import { AGENT_ID, MANDATE_ID, type Slip } from "../../shared/contract";
import { ATTEMPT_CHECK_IDS } from "../../shared/attempt-record";
import { createAgent, validateAgentInput } from "./workspace-agent";
import { createAgentRouter } from "../routes/workspace-agent-compat";
import { createSelftestRouter } from "../routes/workspace-selftest-compat";
import { captureResetGeneration } from "../routes/state";
import { createOperationCache } from "../operations";
import { errorHandler } from "../http";
import * as state from "../state";
import { fakeMonad, fakeWallet } from "../testing/fake-monad";
import { createMonadLedger } from "../chain/ledger";
import { createPermissionService } from "../chain/permission-service";
import { createAttemptService } from "../chain/attempts";
import { stampMatchesRequest, type OriginalRequestContext } from "../chain/evidence";
import { createGateway } from "../gateway/workspace-gateway";

const wallet = fakeWallet();
process.env.ISSUER_PRIVATE_KEY = wallet.privateKey; // Offline child-process fixture only.
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });
beforeEach(() => state.reset());
const allowed = "read_regional_margins";
const forbidden = "read_employee_salaries";
const tool = (name: string, input: unknown = {}) => ({ type: "tool_use", id: randomUUID(), name, input });

async function http<T>(router: Router, work: (url: string) => Promise<T>) {
  const app = express().use(express.json()).use(captureResetGeneration).use(router).use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try { return await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}
const post = (url: string, body: unknown, key = randomUUID()) => fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body),
});

function fixture() {
  const fake = fakeMonad();
  const ledger = createMonadLedger(fake.rpc, () => wallet, { maxTransactions: 4 });
  const evaluate = async (slip: Slip, action: string, _time: number, agent: string = AGENT_ID, context?: OriginalRequestContext) => {
    const evidence = await ledger.lookup(slip.anchor!.txHash);
    return ATTEMPT_CHECK_IDS.map((id) => ({
      id, label: id,
      pass: id === "scope" ? slip.mandate.allowedActions.includes(action) :
        id === "agent" ? agent === AGENT_ID :
        id === "stamped" ? stampMatchesRequest(slip, evidence, context!.requestBlock, wallet.address) : true,
      detail: id === "stamped" ? "Stamped on Monad after this request" : "",
    }));
  };
  const chain = { ...ledger, issuerAddressOrNull: () => wallet.address };
  const permissions = createPermissionService({ state, chain, evaluate });
  const attempts = createAttemptService({ state, chain });
  let reads = 0;
  const act = createGateway({
    state, latestReference: ledger.latestReference, evaluate, record: attempts.record,
    readData: () => { reads++; return [{ region: "OFFLINE_PROTECTED_ROW" }]; },
  });
  return { fake, ledger, permissions, attempts, act, reads: () => reads };
}

test("one genuine model request uses uploaded text including hidden notes, never protected rows", async () => {
  let calls = 0;
  const agent = createAgent(async (body) => {
    calls++;
    assert.equal(body.tool_choice?.type, "any");
    assert.equal(body.max_tokens, 512);
    assert.equal(body.tools?.length, 6);
    const content = JSON.stringify(body.messages);
    assert.ok(content.includes("hidden-instruction-marker"));
    assert.ok(!content.includes("[[HIDDEN]]"));
    assert.ok(!content.includes("OFFLINE_PROTECTED_ROW"));
    assert.ok(!("temperature" in body));
    return { content: [{ type: "text", text: "Real provider text." }, tool(allowed), tool(forbidden), tool(allowed), tool(forbidden)] };
  });
  const result = await agent(validateAgentInput({
    reportId: "clean", upload: { fileName: "report.txt", text: "Visible text [[HIDDEN]]hidden-instruction-marker[[/HIDDEN]]" },
  }));
  assert.deepEqual(result.calls, [allowed, forbidden]);
  assert.equal(result.transcript, "Real provider text.");
  assert.equal(calls, 1);
});

test("zero tools stay zero; unsupported tools, malformed input and provider errors never force actions", async () => {
  assert.deepEqual((await createAgent(async () => ({ content: [{ type: "text", text: "No tools proposed." }] }))({ reportId: "clean" })).calls, []);
  for (const block of [tool("unknown"), tool(allowed, { query: "private" }), tool(allowed, null)]) {
    await assert.rejects(createAgent(async () => ({ content: [block] }))({ reportId: "clean" }), /unsupported/);
  }
  for (const value of [{}, { reportId: "wrong" }, { reportId: "clean", upload: { fileName: "x", text: "x".repeat(60001) } }]) {
    assert.throws(() => validateAgentInput(value));
  }
  await assert.rejects(createAgent(async () => { throw new Error("DO_NOT_EXPOSE_PROVIDER_HEADERS"); })({ reportId: "clean" }),
    (error: Error) => !error.message.includes("DO_NOT_EXPOSE") && error.message.includes("Nothing was substituted"));
});

test("agent HTTP retries call the model once and produce one separate record per real proposal", async () => {
  const f = fixture();
  await f.permissions.issue("consulting");
  let modelCalls = 0;
  const proposeCalls = createAgent(async () => { modelCalls++; return { content: [tool(allowed), tool(forbidden)] }; });
  const router = createAgentRouter({ state, proposeCalls, act: f.act, llmConfigured: () => true, once: createOperationCache() });
  await http(router, async (url) => {
    const key = randomUUID();
    const responses = await Promise.all([1, 2].map(() => post(`${url}/api/agent/run`, { reportId: "poisoned" }, key)));
    assert.ok(responses.every((r) => r.status === 200));
    const [a, b] = await Promise.all(responses.map((r) => r.json()));
    assert.deepEqual(a, b);
    assert.deepEqual(a.receipts.map((r: { decision: string }) => r.decision), ["ALLOWED", "BLOCKED"]);
    assert.notEqual(a.receipts[0].attemptEvidence.record.attemptId, a.receipts[1].attemptEvidence.record.attemptId);
    assert.equal(modelCalls, 1);
    assert.equal(f.reads(), 1);
    assert.equal(f.fake.broadcasts(), 3); // Permission + two attempts, all offline.
    const count = state.getCounter();
    const evalResult = await (await fetch(`${url}/api/agent/eval?n=2.8`)).json();
    assert.equal(evalResult.n, 2);
    assert.equal(evalResult.salariesProposed, 2);
    assert.equal(state.getCounter(), count);
    assert.equal(f.fake.broadcasts(), 3);
  });
});

test("reset while Claude is responding cannot start tools or read protected data", async () => {
  const f = fixture();
  await f.permissions.issue("consulting");
  const proposeCalls = createAgent(async () => { state.reset(); return { content: [tool(allowed)] }; });
  const router = createAgentRouter({ state, proposeCalls, act: f.act, llmConfigured: () => true, once: createOperationCache() });
  await http(router, async (url) => {
    const response = await post(`${url}/api/agent/run`, { reportId: "clean" });
    assert.equal(response.status, 409);
    assert.equal(f.reads(), 0);
    assert.equal(f.fake.broadcasts(), 1);
    assert.equal(state.getCounter(), 0);
  });
});

test("self-test GET never executes; POST verifies four records and stops on insufficient allowance or existing state", async () => {
  const f = fixture();
  let remainingLimit = 0;
  const router = createSelftestRouter({
    state, budgetStatus: () => ({ ...f.ledger.budgetStatus(), limit: remainingLimit }),
    isMockChain: () => false, act: f.act, permissions: f.permissions,
  });
  await http(router, async (url) => {
    assert.equal((await fetch(`${url}/api/selftest`)).status, 200);
    assert.equal(f.fake.broadcasts(), 0);
    assert.equal((await post(`${url}/api/selftest`, {})).status, 409);
    assert.equal(f.fake.broadcasts(), 0);
    remainingLimit = 4;
    const response = await post(`${url}/api/selftest`, {});
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.pass, true, JSON.stringify(result.steps));
    assert.equal(result.steps.length, 4);
    assert.equal(f.fake.broadcasts(), 4);
    assert.equal(state.listReceipts().filter((r) => r.attemptEvidence?.status === "recorded").length, 2);
    assert.equal(state.getSlip(MANDATE_ID)?.label, "Original");
    assert.equal((await post(`${url}/api/selftest`, {})).status, 409);
    assert.equal(f.fake.broadcasts(), 4);
  });
});
