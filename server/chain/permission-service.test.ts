import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Wallet } from "ethers";
import type { Check, Receipt, Slip } from "../../shared/contract";
import { MANDATE_ID } from "../../shared/contract";
import { HttpError } from "../http";
import { chainDeadline } from "./deadline";
import { type OriginalRequestContext, stampMatchesRequest } from "./evidence";
import { createMockLedger } from "./mockLedger";
import { createPermissionService, type PermissionState } from "./permission-service";
import { ChainError } from "./rpc";
import { signMandate } from "./slip";

// Unfunded test-only issuer; no network calls or persisted signing material.
const wallet = Wallet.createRandom();
process.env.ISSUER_PRIVATE_KEY = wallet.privateKey;
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });
const allowed = "read_regional_margins";
const forbidden = "read_employee_salaries";
const checkIds = ["signed", "agent", "valid", "stamped", "scope"] as const;
const checks = (failed: string): Check[] => checkIds.map((id) => ({
  id, label: id, pass: id !== failed, detail: id === "stamped" ? "Stamped on Monad after this request" : "",
}));
const status = (code: number) => (error: unknown) => error instanceof HttpError && error.status === code;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

function harness(options: { context?: boolean; generation?: boolean; fixedSecond?: boolean; maximumMs?: number } = {}) {
  let generation = 1;
  let clock = 1792850000000;
  let next = 1;
  const slips = new Map<string, Slip>();
  const receipts: Receipt[] = [];
  const contexts = new Map<string, OriginalRequestContext>();
  const sent: string[] = [];
  const observedDeadlines: number[] = [];
  const ledger = createMockLedger(() => clock);
  const hooks: {
    anchor?: () => Promise<void>;
    read?: () => Promise<void>;
    evaluate?: () => Promise<Check[]>;
    lookup?: () => Promise<void>;
  } = {};
  const state: PermissionState = {
    getSlip: (id) => slips.get(id),
    addSlip: (slip) => { slips.set(slip.mandate.mandateId, slip); return slip; },
    getReceipt: (id) => receipts.find((r) => r.id === id),
    addReceipt: (input) => {
      const r = { ...input, id: `r_${next++}`, createdAt: new Date(clock).toISOString() };
      receipts.push(r);
      return r;
    },
    listReceipts: () => [...receipts].reverse(),
    ...(options.generation === false ? {} : { getGeneration: () => generation }),
    ...(options.context ? { getRequestContext: (id: string) => contexts.get(id) } : {}),
  };
  const reset = () => { generation++; slips.clear(); receipts.splice(0); contexts.clear(); next = 1; };
  const chain = {
    async latestReference() {
      observedDeadlines.push(chainDeadline());
      await hooks.read?.();
      if (!options.fixedSecond) clock += 1000;
      ledger.advanceBlocks();
      return ledger.latestReference();
    },
    async anchor(digest: string) {
      observedDeadlines.push(chainDeadline());
      sent.push(digest);
      await hooks.anchor?.();
      return ledger.anchor(digest);
    },
    async lookup(hash: string) {
      observedDeadlines.push(chainDeadline());
      await hooks.lookup?.();
      return ledger.lookup(hash);
    },
  };
  let signatureCount = 0;
  const service = createPermissionService({
    state, chain, maximumMs: options.maximumMs,
    sign: async (mandate) => { signatureCount++; return signMandate(mandate); },
    evaluate: async (slip, _action, time, _agent, context) => {
      observedDeadlines.push(chainDeadline());
      if (hooks.evaluate) return hooks.evaluate();
      const evidence = await ledger.lookup(slip.anchor!.txHash);
      const result = checks("stamped");
      result[3].pass = context ? stampMatchesRequest(slip, evidence, context.requestBlock) : evidence!.blockTimestamp <= time;
      return result;
    },
  });
  async function block(failed = "scope") {
    const original = state.getSlip(MANDATE_ID)!;
    const ref = await chain.latestReference();
    const receipt = state.addReceipt({
      kind: "action", source: "forced", decision: "BLOCKED", data: null,
      agentId: original.mandate.agentId, mandateId: MANDATE_ID, action: forbidden,
      actionTime: ref.blockTimestamp, checks: checks(failed), explorerUrl: original.anchor!.explorerUrl,
    });
    contexts.set(receipt.id, {
      generation, originalSlip: structuredClone(original), requestBlock: ref,
      agentId: receipt.agentId, action: receipt.action,
      resource: original.mandate.resource, scenarioId: original.mandate.scenarioId,
    });
    return receipt;
  }
  return { service, state, reset, block, hooks, sent, slips, receipts, contexts, observedDeadlines, signatureCount: () => signatureCount };
}

test("HTTP operation retries retain the original mandate, signature and fingerprint", async () => {
  const h = harness();
  h.hooks.anchor = async () => { throw new ChainError("Uncertain broadcast.", `0x${"a".repeat(64)}`); };
  await assert.rejects(h.service.issue("consulting"), status(503));
  h.hooks.anchor = undefined;
  const first = await h.service.issue("consulting");
  const retry = await h.service.issue("consulting");
  assert.deepEqual(retry, first);
  assert.equal(h.signatureCount(), 1);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0], h.sent[1]);
  assert.equal(h.slips.size, 1);
});

test("concurrent clicks cannot create parallel permission operations", async () => {
  const h = harness();
  const gate = deferred();
  h.hooks.read = () => gate.promise;
  const first = h.service.issue("consulting");
  await assert.rejects(h.service.issue("consulting"), status(409));
  gate.resolve();
  await first;
  assert.equal(h.signatureCount(), 1);
  assert.equal(h.sent.length, 1);
});

test("a reset generation prevents empty-session stale signing and publication", async () => {
  const h = harness();
  const gate = deferred();
  h.hooks.read = () => gate.promise;
  const first = h.service.issue("consulting");
  h.reset();
  gate.resolve();
  await assert.rejects(first, status(409));
  assert.equal(h.signatureCount(), 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.slips.size, 0);
  h.hooks.read = undefined;
  await h.service.issue("consulting");
  assert.equal(h.slips.size, 1);
});

test("reset after broadcast cannot publish the old permission in the new session", async () => {
  const h = harness();
  h.hooks.anchor = async () => { h.reset(); };
  await assert.rejects(h.service.issue("consulting"), status(409));
  assert.equal(h.sent.length, 1); // Reset cannot cancel already submitted work.
  assert.equal(h.slips.size, 0);
});

test("legacy state supports reset after completion without pretending to detect empty-session races", async () => {
  const h = harness({ generation: false });
  const first = await h.service.issue("consulting");
  h.reset();
  const second = await h.service.issue("consulting");
  assert.notEqual(first.digest, second.digest);
  assert.equal(h.sent.length, 2);
});

test("a mutated original permission cannot rewrite the private historical snapshot", async () => {
  const h = harness();
  await h.service.issue("consulting");
  h.state.getSlip(MANDATE_ID)!.mandate.allowedActions.push(forbidden);
  await assert.rejects(h.service.issue("consulting"), status(409));
  await assert.rejects(h.service.replayDispute(), status(409));
  assert.equal(h.sent.length, 1);
});

test("only a scope-blocked salary request is eligible for the amended-permission scene", async () => {
  const h = harness();
  await h.service.issue("consulting");
  await h.block("agent");
  await assert.rejects(h.service.replayDispute(), status(409));
  assert.equal(h.sent.length, 1);
  assert.equal(h.signatureCount(), 1);
});

test("a genuine amendment is idempotent and never writes an ALLOWED dispute receipt", async () => {
  const h = harness();
  const original = await h.service.issue("consulting");
  const blocked = await h.block();
  const result = await h.service.replayDispute();
  assert.equal(result.decision, "REJECTED");
  assert.equal(result.data, null);
  assert.equal(result.actionTime, blocked.actionTime);
  assert.deepEqual(result.checks.filter((c) => !c.pass).map((c) => c.id), ["stamped"]);
  assert.equal(h.state.getSlip(result.mandateId)!.mandate.expiresAt, original.mandate.expiresAt);
  assert.ok(h.state.getSlip(result.mandateId)!.mandate.allowedActions.includes(allowed));
  await h.block(); // A newly arriving action cannot silently retarget a retry.
  const retry = await h.service.replayDispute();
  assert.deepEqual(retry, result);
  assert.equal(h.sent.length, 2);
  assert.equal(h.receipts.filter((r) => r.kind === "dispute").length, 1);
});

test("the proposed context integration rejects a later block in the very same second", async () => {
  const h = harness({ context: true, fixedSecond: true });
  await h.service.issue("consulting");
  const blocked = await h.block();
  const result = await h.service.replayDispute();
  const amended = h.state.getSlip(result.mandateId)!;
  const context = h.contexts.get(blocked.id)!;
  assert.equal(amended.anchor!.blockTimestamp, blocked.actionTime);
  assert.ok(amended.anchor!.blockNumber > context.requestBlock.blockNumber);
  assert.equal(result.decision, "REJECTED");
});

test("missing or mismatched request context prevents a new amendment", async () => {
  for (const mismatch of [false, true]) {
    const h = harness({ context: true });
    await h.service.issue("consulting");
    const blocked = await h.block();
    if (mismatch) h.contexts.get(blocked.id)!.resource = "another-resource";
    else h.contexts.clear();
    await assert.rejects(h.service.replayDispute(), status(409));
    assert.equal(h.sent.length, 1);
  }
});

test("verification errors cannot masquerade as a successful late-permission rejection", async () => {
  const h = harness();
  await h.service.issue("consulting");
  await h.block();
  h.hooks.lookup = async () => { throw new ChainError("RPC unavailable."); };
  await assert.rejects(h.service.replayDispute(), status(503));
  assert.equal(h.receipts.filter((r) => r.kind === "dispute").length, 0);
  h.hooks.lookup = undefined;
  h.hooks.evaluate = async () => checks("scope");
  await assert.rejects(h.service.replayDispute(), status(503));
  h.hooks.evaluate = async () => {
    const result = checks("stamped");
    result[3].detail = "Could not reach Monad to verify the stamp";
    return result;
  };
  await assert.rejects(h.service.replayDispute(), status(503));
  assert.equal(h.sent.length, 2); // Retry uses the existing amendment, no new stamp.
  h.hooks.evaluate = undefined;
  await h.service.replayDispute();
  assert.equal(h.sent.length, 2);
});

test("reset or original-request mutation during dispute prevents both state writes", async () => {
  for (const reset of [true, false]) {
    const h = harness();
    await h.service.issue("consulting");
    const blocked = await h.block();
    h.hooks.evaluate = async () => {
      if (reset) h.reset();
      else blocked.agentId = "modified-agent";
      return checks("stamped");
    };
    await assert.rejects(h.service.replayDispute(), status(409));
    assert.equal(h.receipts.filter((r) => r.kind === "dispute").length, 0);
    assert.equal([...h.slips.values()].filter((s) => s.label === "Amended").length, 0);
  }
});

test("one operation deadline covers initial reads, signing, anchor, lookup and evaluator", async () => {
  const h = harness();
  await h.service.issue("consulting");
  assert.equal(new Set(h.observedDeadlines).size, 1);
  await h.block();
  h.observedDeadlines.splice(0);
  await h.service.replayDispute();
  assert.equal(new Set(h.observedDeadlines).size, 1);
  const slow = harness({ maximumMs: 25 });
  slow.hooks.read = () => new Promise((resolve) => setTimeout(resolve, 40));
  await assert.rejects(slow.service.issue("consulting"), status(503));
  assert.equal(slow.sent.length, 0);
});
