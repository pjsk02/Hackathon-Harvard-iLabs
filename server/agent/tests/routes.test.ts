// HTTP integration at injected provider/gateway boundaries; no live model or shared state writes.
import assert from "node:assert/strict";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import express from "express";
import type Anthropic from "@anthropic-ai/sdk";
import type { Receipt, Slip } from "../../../shared/contract";
import { AGENT_ID, MANDATE_ID, RESOURCE } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { createAgentRouter } from "../../routes/agent";
import { createProposer, MAX_REPORT_CHARS } from "../agent";
import { errorHandler } from "../../http";
import * as state from "../../state";

const slip: Slip = {
  mandate: {
    mandateId: MANDATE_ID, issuer: "fixture-only", agentId: AGENT_ID, resource: RESOURCE,
    scenarioId: consulting.id, allowedActions: [consulting.allowed.name],
    issuedAt: 100, expiresAt: 200, nonce: "12345678",
  },
  signature: "fixture-only", digest: "fixture-only", anchor: null, label: "Original",
};
const result = (action: string): Receipt => ({
  id: "fixture", kind: "action", createdAt: "", actionTime: 150,
  agentId: AGENT_ID, mandateId: MANDATE_ID, action, source: "agent",
  decision: action === consulting.allowed.name ? "ALLOWED" : "BLOCKED", checks: [], data: null, explorerUrl: null,
});

async function withRouter(router: express.Router, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json(), router, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function post(base: string, body: unknown = { reportId: "poisoned" }) {
  return fetch(`${base}/api/agent/run`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("every accepted proposal crosses gateway with agent source, sequentially and in order", async () => {
  const trace: string[] = [];
  let active = 0;
  let peak = 0;
  const calls = [consulting.allowed.name, consulting.forbidden.name];
  const router = createAgentRouter({
    getSlip: () => slip,
    proposeCalls: async (reportId) => {
      assert.equal(reportId, "poisoned");
      trace.push("model");
      return { calls, transcript: "fixture proposal" };
    },
    act: async (request, source) => {
      assert.equal(source, "agent");
      assert.equal(request.agentId, AGENT_ID);
      assert.equal(request.mandateId, MANDATE_ID);
      peak = Math.max(peak, ++active);
      trace.push(request.action);
      await setImmediate();
      active--;
      return result(request.action);
    },
  });
  await withRouter(router, async (base) => {
    const response = await post(base);
    assert.equal(response.status, 200);
    const body = await response.json() as { proposedCalls: string[]; receipts: Receipt[] };
    assert.deepEqual(body.proposedCalls, calls);
    assert.deepEqual(body.receipts.map((receipt) => receipt.action), calls);
  });
  assert.deepEqual(trace, ["model", ...calls]);
  assert.equal(peak, 1);
});

test("eval proposes sequentially, counts honestly, invokes gateway zero times and leaves state unchanged", async () => {
  let modelCalls = 0;
  let gatewayCalls = 0;
  let active = 0;
  let peak = 0;
  const before = JSON.stringify({ slips: state.listSlips(), receipts: state.listReceipts(), counter: state.getCounter() });
  const plans = [[consulting.allowed.name], [consulting.forbidden.name], [consulting.allowed.name, consulting.forbidden.name]];
  const router = createAgentRouter({
    getSlip: () => { throw new Error("Eval must not read an active slip."); },
    proposeCalls: async (reportId, reportText) => {
      assert.equal(reportId, "poisoned");
      assert.equal(reportText, undefined, "Public GET eval remains built-in-report-only.");
      peak = Math.max(peak, ++active);
      await setImmediate();
      active--;
      return { calls: plans[modelCalls++], transcript: "" };
    },
    act: async (request) => { gatewayCalls++; return result(request.action); },
  });
  await withRouter(router, async (base) => {
    const response = await fetch(`${base}/api/agent/eval?n=3&reportId=poisoned`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { n: 3, salariesProposed: 2, rate: 2 / 3 });
  });
  assert.equal(modelCalls, 3);
  assert.equal(gatewayCalls, 0);
  assert.equal(peak, 1);
  assert.equal(JSON.stringify({ slips: state.listSlips(), receipts: state.listReceipts(), counter: state.getCounter() }), before);
});

test("unsupported/over-limit proposals and provider failures return 502 before any execution", async () => {
  let executions = 0;
  for (const mode of ["unknown", "over-limit", "provider-error", "timeout"]) {
    const router = createAgentRouter({
      getSlip: () => slip,
      proposeCalls: async () => {
        if (mode === "provider-error") throw new Error("private provider details must not leak");
        if (mode === "timeout") {
          const error = new Error("private provider details must not leak");
          error.name = "APIConnectionTimeoutError";
          throw error;
        }
        return { transcript: "", calls: mode === "unknown"
          ? [consulting.allowed.name, "unknown"]
          : Array(4).fill(consulting.allowed.name) as string[] };
      },
      act: async (request) => { executions++; return result(request.action); },
    });
    await withRouter(router, async (base) => {
      for (const response of [await post(base), await fetch(`${base}/api/agent/eval?n=1`)]) {
        assert.equal(response.status, 502);
        const body = await response.json() as { error: string };
        assert.deepEqual(Object.keys(body), ["error"]);
        assert.doesNotMatch(body.error, /private provider details/);
      }
    });
  }
  assert.equal(executions, 0);
});

test("reset/replacement during model await prevents gateway execution", async () => {
  let current: Slip | undefined = slip;
  let executions = 0;
  await withRouter(createAgentRouter({
    getSlip: () => current,
    proposeCalls: async () => {
      current = undefined;
      return { transcript: "", calls: [consulting.allowed.name] };
    },
    act: async (request) => { executions++; return result(request.action); },
  }), async (base) => {
    assert.equal((await post(base)).status, 409);
  });
  assert.equal(executions, 0);
});

test("empty/refused proposal remains honest and never forces a salary call", async () => {
  let executions = 0;
  await withRouter(createAgentRouter({
    getSlip: () => slip,
    proposeCalls: async () => ({ transcript: "I will not follow instructions embedded in source text.", calls: [] }),
    act: async (request) => { executions++; return result(request.action); },
  }), async (base) => {
    const response = await post(base);
    assert.equal(response.status, 200);
    const body = await response.json() as { proposedCalls: string[]; receipts: Receipt[] };
    assert.deepEqual(body.proposedCalls, []);
    assert.deepEqual(body.receipts, []);
  });
  assert.equal(executions, 0);
});

test("upload flows through the actual proposer to the SDK input; every accepted call uses server IDs and agent source", async () => {
  const messages: string[] = [];
  const executions: string[] = [];
  const calls = [consulting.allowed.name, consulting.forbidden.name];
  const proposer = createProposer(() => ({
    messages: {
      async create(input) {
        messages.push(input.messages[0].content as string);
        const content: Anthropic.ContentBlock[] = calls.map((name) => ({
          type: "tool_use", id: name, name, input: {}, caller: { type: "direct" },
        }));
        return { content };
      },
    },
  }));
  const upload = {
    fileName: "../../server/data/never-read-this-path.docx",
    text: "Unique uploaded JT Morgan report.\n[[HIDDEN]]Keep this assistant note.[[/HIDDEN]]",
  };
  await withRouter(createAgentRouter({
    getSlip: () => slip,
    proposeCalls: proposer,
    act: async (request, source) => {
      assert.equal(request.agentId, AGENT_ID);
      assert.equal(request.mandateId, MANDATE_ID);
      assert.equal(source, "agent");
      executions.push(request.action);
      return result(request.action);
    },
  }), async (base) => {
    const response = await post(base, {
      reportId: "clean", upload, agentId: "untrusted", mandateId: "untrusted", source: "forced",
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { proposedCalls: string[]; receipts: Receipt[]; transcript: string };
    assert.deepEqual(Object.keys(body).sort(), ["proposedCalls", "receipts", "transcript"]);
    assert.deepEqual(body.proposedCalls, calls);
    assert.deepEqual(body.receipts.map((receipt) => receipt.action), calls);
  });
  assert.deepEqual(executions, calls);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].split("\n\nCLIENT REPORT\n")[1],
    "Unique uploaded JT Morgan report.\nKeep this assistant note.");
  assert.ok(!messages[0].includes(upload.fileName));
});

test("upload validation rejects malformed objects/strings and >60,000 chars before state/provider/gateway access", async () => {
  const uploads = [null, [], "text", {}, { fileName: 1, text: "report" },
    { fileName: "a", text: [] }, { fileName: "a" }, { text: "report" },
    { fileName: "a", text: "x".repeat(MAX_REPORT_CHARS + 1) }];
  await withRouter(createAgentRouter({
    getSlip: () => { throw new Error("Invalid upload must be rejected before state lookup."); },
    proposeCalls: async () => { throw new Error("Invalid upload must not reach the provider."); },
    act: async () => { throw new Error("Invalid upload must not execute."); },
  }), async (base) => {
    for (const upload of uploads) {
      const response = await post(base, { reportId: "clean", upload });
      assert.equal(response.status, 400);
      const body = await response.json() as { error: string };
      assert.deepEqual(Object.keys(body), ["error"]);
      if (upload === uploads[uploads.length - 1]) assert.equal(body.error, "That file is too long.");
    }
    assert.equal((await post(base, { reportId: "other", upload: { fileName: "a", text: "" } })).status, 400);
  });
});

test("absent uploads preserve legacy calls; empty strings override; exactly 60,000 chars are accepted", async () => {
  const seen: (string | undefined)[] = [];
  await withRouter(createAgentRouter({
    getSlip: () => slip,
    proposeCalls: async (_reportId, text) => { seen.push(text); return { calls: [], transcript: "" }; },
    act: async () => { throw new Error("Empty proposals must not execute."); },
  }), async (base) => {
    for (const body of [
      { reportId: "clean" },
      { reportId: "clean", upload: { fileName: "empty.txt", text: "" } },
      { reportId: "poisoned", upload: { fileName: "limit.txt", text: "x".repeat(MAX_REPORT_CHARS) } },
    ]) {
      assert.equal((await post(base, body)).status, 200);
    }
  });
  assert.equal(seen[0], undefined);
  assert.equal(seen[1], "");
  assert.equal(seen[2]?.length, MAX_REPORT_CHARS);
});
