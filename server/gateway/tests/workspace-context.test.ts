// Real signatures with synthetic finality; no provider, remote database or live sends.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Wallet } from "ethers";
import type { Mandate, Slip } from "../../../shared/contract";
import { AGENT_ID, CHAIN_ID, RESOURCE } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import type { ChainReference, LookupResult, OriginalRequestContext } from "../../chain/evidence";
import { digestOf, DOMAIN, TYPES } from "../../chain/slip";
import { createIsolatedState, type NewReceipt } from "../../state";
import { createWorkspaceEvaluator } from "../workspace-checks";
import { createCompatibilityEvaluator } from "../checks";
import { createGateway } from "../workspace-gateway";
import { readEvaluationData } from "../gateway";
import { createMonadLedger } from "../../chain/ledger";
import { createPermissionService } from "../../chain/permission-service";
import { createAttemptService } from "../../chain/attempts";
import { fakeMonad, fakeWallet } from "../../testing/fake-monad";

function composed() {
  const wallet = fakeWallet();
  const fake = fakeMonad(); // Every block has the SAME timestamp.
  const store = createIsolatedState();
  const ledger = createMonadLedger(fake.rpc, () => wallet, { maxTransactions: 4 });
  const failures = { capture: false, lookup: false };
  const evaluate = createWorkspaceEvaluator({ issuerAddress: () => wallet.address, lookup: async hash => {
    if (failures.lookup) throw new Error("Offline verification outage");
    return ledger.lookup(hash);
  } });
  const permissions = createPermissionService({ state: store, chain: ledger, evaluate });
  const attempts = createAttemptService({ state: store, chain: { ...ledger, issuerAddressOrNull: () => wallet.address } });
  const reads = { allowed: 0, forbidden: 0 };
  const act = createGateway({ state: store, evaluate, record: attempts.record,
    latestReference: async () => {
      if (failures.capture) throw new Error("Offline capture outage");
      return ledger.latestReference();
    },
    readData: action => {
      if (action === consulting.forbidden.name) reads.forbidden++; else reads.allowed++;
      return readEvaluationData(action);
    },
  });
  return { wallet, fake, store, ledger, permissions, act, reads, failures };
}

const ref = (height: number): ChainReference => ({ chainId: CHAIN_ID, blockNumber: height, blockTimestamp: 200, blockHash: "0x" + height.toString(16).padStart(64, "0") });
async function fixture() {
  const wallet = Wallet.createRandom();
  const stamps = new Map<string, LookupResult>();
  const store = createIsolatedState();
  let serial = 0;
  async function sign(actions: string[], height = 10, expiry = 300): Promise<Slip> {
    const mandate: Mandate = {
      mandateId: "context-permission-" + ++serial, issuer: wallet.address, agentId: AGENT_ID,
      resource: RESOURCE, scenarioId: consulting.id, allowedActions: actions,
      issuedAt: 100, expiresAt: expiry, nonce: "12345678",
    };
    const digest = digestOf(mandate);
    const txHash = "0x" + serial.toString(16).padStart(64, "0");
    stamps.set(txHash, { ...ref(height), from: wallet.address, to: wallet.address, value: "0x0", status: 1, data: digest, finalized: true, transactionIndex: 0 });
    return { mandate, digest, signature: await wallet.signTypedData(DOMAIN, TYPES, mandate), label: height === 10 ? "Original" : "Amended", anchor: { txHash, blockNumber: height, blockTimestamp: 200, explorerUrl: "offline-fixture" } };
  }
  const original = await sign([consulting.allowed.name]);
  store.addSlip(original);
  const context = (action = consulting.allowed.name): OriginalRequestContext => ({
    generation: store.getGeneration(), originalSlip: structuredClone(original), requestBlock: ref(11),
    agentId: AGENT_ID, action, resource: RESOURCE, scenarioId: consulting.id,
  });
  const deps = { issuerAddress: () => wallet.address, lookup: async (hash: string) => stamps.get(hash) ?? null };
  const evaluate = createWorkspaceEvaluator(deps);
  const input = (action = consulting.allowed.name): NewReceipt => ({
    kind: "action", source: "forced", decision: "BLOCKED", data: null, checks: [],
    actionTime: 200, agentId: AGENT_ID, mandateId: original.mandate.mandateId, action, explorerUrl: null,
  });
  return { wallet, store, stamps, sign, original, context, evaluate, deps, input };
}

test("receipt/context publication fails atomically and stores defensive context copies", async () => {
  const f = await fixture();
  for (const change of [{ generation: -1 }, { action: "different" }, { resource: "different" }, { requestBlock: { ...ref(11), chainId: 1 } }]) {
    assert.throws(() => f.store.addActionReceipt(f.input(), { ...f.context(), ...change }, 0), { status: 409 });
    assert.equal(f.store.getCounter(), 0);
    assert.equal(f.store.listReceipts().length, 0);
  }
  const context = f.context();
  const receipt = f.store.addActionReceipt(f.input(), context, 0);
  assert.equal(receipt.id, "r_001");
  context.requestBlock.blockNumber = 99;
  context.originalSlip.mandate.allowedActions.push(consulting.forbidden.name);
  const saved = f.store.getRequestContext(receipt.id)!;
  assert.equal(saved.requestBlock.blockNumber, 11);
  assert.deepEqual(saved.originalSlip.mandate.allowedActions, [consulting.allowed.name]);
  saved.requestBlock.blockNumber = 88;
  assert.equal(f.store.getRequestContext(receipt.id)!.requestBlock.blockNumber, 11);
  f.store.reset();
  assert.equal(f.store.getRequestContext(receipt.id), undefined);
  f.store.addSlip(f.original);
  const newer = f.store.addActionReceipt(f.input(), f.context(), 1);
  assert.equal(newer.id, receipt.id);
  assert.equal(f.store.getRequestContext(newer.id)!.generation, 1);
});

test("isolated close is idempotent, fences delayed writes, and never changes another instance", async () => {
  const f = await fixture();
  const other = createIsolatedState();
  let resume!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const context = f.context();
  const pending = f.store.withResetGeneration(0, async () => {
    await gate;
    f.store.addActionReceipt(f.input(), context, 0);
  });
  const rejected = assert.rejects(pending, { status: 409 });
  f.store.close(); f.store.close(); resume();
  await rejected;
  assert.throws(() => f.store.reset(), { status: 409 });
  assert.equal(other.getCounter(), 0);
  assert.equal(other.getGeneration(), 0);
});

test("P1-compatible evaluator rejects a later genuine amendment in the same second", async () => {
  const f = await fixture();
  const amended = await f.sign([consulting.allowed.name, consulting.forbidden.name], 12);
  const evaluate = createCompatibilityEvaluator(f.deps);
  const checks = await evaluate(amended, consulting.forbidden.name, 200, AGENT_ID, f.context(consulting.forbidden.name));
  assert.deepEqual(checks.filter(check => !check.pass).map(check => check.id), ["stamped"]);
  assert.equal(checks[3].detail, "Stamped on Monad after this request");
  assert.notEqual(amended.digest, f.original.digest);
  assert.notEqual(amended.mandate.mandateId, f.original.mandate.mandateId);
});

test("malformed or mismatched original context never falls back to time ordering", async () => {
  const f = await fixture();
  for (const context of [undefined, null, {}, { ...f.context(), action: "different" },
    { ...f.context(), agentId: "different" }, { ...f.context(), generation: NaN },
    { ...f.context(), requestBlock: { ...ref(11), chainId: 1 } },
    { ...f.context(), requestBlock: { ...ref(11), blockHash: "wrong" } },
    { ...f.context(), requestBlock: { ...ref(11), blockTimestamp: 201 } }]) {
    await assert.rejects(f.evaluate(f.original, consulting.allowed.name, 200, AGENT_ID, context as OriginalRequestContext), { status: 503 });
  }
});

test("active gateway publishes one receipt and context; blocked requests never read data", async () => {
  const f = await fixture(); let reads = 0; let recordings = 0;
  const act = createGateway({ state: f.store, latestReference: async () => ref(11), evaluate: f.evaluate,
    readData: () => { reads++; return [{ test: true }]; }, record: async receipt => { recordings++; return receipt; } });
  for (const action of [consulting.allowed.name, consulting.forbidden.name]) {
    const receipt = await act({ agentId: AGENT_ID, mandateId: f.original.mandate.mandateId, action }, "forced");
    assert.equal(receipt.decision, action === consulting.allowed.name ? "ALLOWED" : "BLOCKED");
    assert.equal(f.store.getRequestContext(receipt.id)!.requestBlock.blockNumber, 11);
    if (receipt.decision === "BLOCKED") assert.equal(receipt.data, null);
  }
  assert.equal(reads, 1); assert.equal(recordings, 2); assert.equal(f.store.getCounter(), 2);
});

test("readback outages, missing/unfinalized evidence and conflicting block hashes create no policy receipt", async () => {
  for (const failure of ["outage", "missing", "unfinalized", "conflict"] as const) {
    const f = await fixture(); let reads = 0; let recordings = 0;
    const evaluate = createWorkspaceEvaluator({ ...f.deps, lookup: async hash => {
      if (failure === "outage") throw new Error("offline outage");
      const stamp = f.stamps.get(hash)!;
      if (failure === "missing") return null;
      if (failure === "unfinalized") return { ...stamp, finalized: false } as unknown as LookupResult;
      return { ...stamp, blockHash: "0x" + "f".repeat(64) };
    } });
    const act = createGateway({ state: f.store, latestReference: async () => failure === "conflict" ? ref(10) : ref(11), evaluate,
      readData: () => { reads++; return []; }, record: async receipt => { recordings++; return receipt; } });
    await assert.rejects(act({ agentId: AGENT_ID, mandateId: f.original.mandate.mandateId, action: consulting.allowed.name }, "agent"), { status: 503 });
    assert.equal(reads, 0); assert.equal(recordings, 0); assert.equal(f.store.getCounter(), 0);
  }
});

test("reset during a rejecting capture is fenced before data or publication", async () => {
  const f = await fixture(); let reads = 0;
  const act = createGateway({ state: f.store, latestReference: async () => { f.store.reset(); throw new Error("offline capture failure"); }, evaluate: f.evaluate,
    readData: () => { reads++; return []; }, record: async receipt => receipt });
  await assert.rejects(act({ agentId: AGENT_ID, mandateId: f.original.mandate.mandateId, action: consulting.allowed.name }, "agent"), { status: 409 });
  assert.equal(reads, 0); assert.equal(f.store.getCounter(), 0);
});

test("truncated active-model responses fail before any tool can execute", async () => {
  const { createAgent } = await import("../../agent/workspace-agent");
  const propose = createAgent(async () => ({ stop_reason: "max_tokens", content: [
    { type: "tool_use", name: consulting.allowed.name, input: {} },
  ] }));
  await assert.rejects(propose({ reportId: "clean" }), { status: 502 });
});

test("actual P1 service, atomic store and P2 evaluator reject same-second replay with separate recorded attempts", async () => {
  const f = composed();
  const prior = process.env.ISSUER_PRIVATE_KEY;
  process.env.ISSUER_PRIVATE_KEY = f.wallet.privateKey; // Unfunded in-memory test identity.
  try {
    const original = await f.permissions.issue(consulting.id);
    const request = { agentId: AGENT_ID, mandateId: original.mandate.mandateId, action: consulting.allowed.name };
    const allowed = await f.act(request, "forced");
    const blocked = await f.act({ ...request, action: consulting.forbidden.name }, "agent");
    const frozen = f.store.getRequestContext(blocked.id)!;
    const altered = f.store.getRequestContext(blocked.id)!;
    altered.requestBlock.blockNumber = 999999;
    altered.originalSlip.mandate.allowedActions.push(consulting.forbidden.name);
    assert.deepEqual(f.store.getRequestContext(blocked.id), frozen);
    const disputed = await f.permissions.replayDispute();
    const amended = f.store.getSlip(disputed.mandateId)!;
    assert.deepEqual([allowed.decision, blocked.decision, disputed.decision], ["ALLOWED", "BLOCKED", "REJECTED"]);
    assert.deepEqual(disputed.checks.filter(check => !check.pass).map(check => check.id), ["stamped"]);
    assert.equal(disputed.data, null);
    assert.equal(blocked.data, null);
    assert.equal(original.anchor!.blockTimestamp, frozen.requestBlock.blockTimestamp);
    assert.equal(amended.anchor!.blockTimestamp, frozen.requestBlock.blockTimestamp);
    assert.ok(amended.anchor!.blockNumber > frozen.requestBlock.blockNumber);
    assert.equal(allowed.attemptEvidence?.status, "recorded");
    assert.equal(blocked.attemptEvidence?.status, "recorded");
    assert.equal(f.fake.broadcasts(), 4); // Four synthetic transactions; no live transport.
    assert.deepEqual(f.reads, { allowed: 1, forbidden: 0 });
    assert.deepEqual(await f.permissions.replayDispute(), disputed);
    assert.equal(f.fake.broadcasts(), 4);
  } finally {
    f.store.close();
    if (prior === undefined) delete process.env.ISSUER_PRIVATE_KEY; else process.env.ISSUER_PRIVATE_KEY = prior;
  }
});

test("actual composed capture and verification outages never substitute a clock, read data or publish a receipt", async () => {
  const prior = process.env.ISSUER_PRIVATE_KEY;
  try {
    for (const phase of ["capture", "lookup"] as const) {
      const f = composed();
      process.env.ISSUER_PRIVATE_KEY = f.wallet.privateKey;
      try {
        const original = await f.permissions.issue(consulting.id);
        f.failures[phase] = true;
        await assert.rejects(f.act({ agentId: AGENT_ID, mandateId: original.mandate.mandateId, action: consulting.allowed.name }, "agent"), { status: 503 });
        assert.deepEqual(f.reads, { allowed: 0, forbidden: 0 });
        assert.equal(f.store.getCounter(), 0);
        assert.deepEqual(f.store.listReceipts(), []);
        assert.equal(f.fake.broadcasts(), 1); // Original fixture permission only.
      } finally { f.store.close(); }
    }
  } finally {
    if (prior === undefined) delete process.env.ISSUER_PRIVATE_KEY; else process.env.ISSUER_PRIVATE_KEY = prior;
  }
});
