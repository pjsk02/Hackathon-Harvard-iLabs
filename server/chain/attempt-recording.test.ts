import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { id, keccak256, toUtf8Bytes } from "ethers";
import type { AttemptRecord, Receipt, Slip } from "../../shared/contract";
import { AGENT_ID, CHAIN_ID, EXPLORER_TX_URL, MANDATE_ID, RESOURCE } from "../../shared/contract";
import { ATTEMPT_CHECK_IDS, attemptFingerprint, canonicalAttemptRecord } from "../../shared/attempt-record";
import * as state from "../state";
import { createGateway } from "../gateway/gateway";
import { createAttemptService } from "./attempts";
import { createMonadLedger } from "./ledger";
import { createPermissionService } from "./permission-service";
import { buildMandate, signMandate } from "./slip";
import { stampMatchesRequest, type LookupResult, type OriginalRequestContext } from "./evidence";
import { fakeMonad, fakeWallet, blockHash } from "../testing/fake-monad";
import { createOperationCache } from "../operations";

const wallet = fakeWallet();
process.env.ISSUER_PRIVATE_KEY = wallet.privateKey; // Unfunded ephemeral fixture, child process only.
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });
beforeEach(() => state.reset());
const timestamp = 1_792_850_000;
const allowed = "read_regional_margins";
const forbidden = "read_employee_salaries";
const reference = { chainId: CHAIN_ID, blockNumber: 100, blockHash: blockHash(100), blockTimestamp: timestamp };
const request = { agentId: AGENT_ID, mandateId: MANDATE_ID, action: allowed };
const checks = (okay = true) => ATTEMPT_CHECK_IDS.map((id) => ({ id, pass: okay || id !== "scope", label: id, detail: "" }));

async function setup() {
  const mandate = buildMandate({ scenarioId: "consulting", allowedActions: [allowed], issuedAt: timestamp });
  const slip: Slip = {
    mandate, ...await signMandate(mandate), label: "Original",
    anchor: { txHash: id("permission"), blockNumber: 99, blockTimestamp: timestamp, explorerUrl: `${EXPLORER_TX_URL}${id("permission")}` },
  };
  state.addSlip(slip);
  const fake = fakeMonad();
  let limit = 20;
  const ledger = createMonadLedger(fake.rpc, () => wallet, { maxTransactions: () => limit, operationMs: 200 });
  const chain = { ...ledger, issuerAddressOrNull: () => wallet.address };
  const attempts = createAttemptService({ state, chain });
  let reads = 0;
  const deps = {
    state, latestReference: async () => reference,
    evaluate: async (_slip: Slip, action: string) => checks(action === allowed),
    record: attempts.record,
    readData: () => { reads++; return [{ region: "private-margin-marker" }]; },
  };
  return { slip, fake, ledger, chain, attempts, deps, act: createGateway(deps), reads: () => reads, setLimit: (n: number) => { limit = n; } };
}

test("canonical commitment has a fixed tuple vector and rejects arbitrary payload fields", () => {
  const record: AttemptRecord = {
    version: 1, attemptId: "00000000-0000-4000-8000-000000000001", receiptId: "r_001", chainId: CHAIN_ID,
    permissionFingerprint: `0x${"11".repeat(32)}`,
    requestBlock: { blockNumber: 100, blockHash: `0x${"22".repeat(32)}`, blockTimestamp: 10000 },
    agent: AGENT_ID, action: allowed, source: "forced", decision: "ALLOWED",
    checks: ATTEMPT_CHECK_IDS.map((id) => ({ id, pass: true })),
  };
  const vector = `["envoi.attempt.v1",1,"00000000-0000-4000-8000-000000000001","r_001",10143,"0x${"11".repeat(32)}",100,"0x${"22".repeat(32)}",10000,"atlas-research-agent","read_regional_margins","forced","ALLOWED",[["signed",true],["agent",true],["valid",true],["stamped",true],["scope",true]]]`;
  assert.equal(attemptFingerprint(record), keccak256(toUtf8Bytes(vector)));
  for (const bad of [{ ...record, data: "salary-private-marker" }, { ...record, version: 2 }, { ...record, checks: [...record.checks].reverse() }]) {
    assert.throws(() => canonicalAttemptRecord(bad));
  }
  assert.equal(attemptFingerprint(record), attemptFingerprint({ ...record, permissionFingerprint: record.permissionFingerprint.toUpperCase().replace("0X", "0x") }));
});

test("identical same-second actions have distinct IDs/fingerprints; blocked data is never read", async () => {
  const f = await setup();
  const a = await f.act(request, "agent");
  const b = await f.act(request, "agent");
  const blocked = await f.act({ ...request, action: forbidden }, "forced");
  assert.notEqual(a.attemptEvidence!.record.attemptId, b.attemptEvidence!.record.attemptId);
  assert.notEqual(a.attemptEvidence!.fingerprint, b.attemptEvidence!.fingerprint);
  assert.equal(a.actionTime, b.actionTime);
  assert.equal(a.attemptEvidence!.status, "recorded");
  assert.equal(blocked.decision, "BLOCKED");
  assert.equal(blocked.data, null);
  assert.equal(f.reads(), 2);
  assert.equal(state.getCounter(), 3);
  assert.equal(f.fake.broadcasts(), 3);
  for (const r of [a, b, blocked]) {
    const evidence = r.attemptEvidence!;
    assert.equal(evidence.record.permissionFingerprint, f.slip.digest);
    assert.ok(!JSON.stringify(evidence.record).includes("private-margin-marker"));
    assert.notEqual(r.explorerUrl, evidence.anchor?.explorerUrl);
    assert.equal(f.fake.records.get(evidence.txHash!)!.tx.data, evidence.fingerprint);
  }
});

test("paused, exhausted and definitely rejected recording preserve ALLOWED and its data", async () => {
  const f = await setup();
  f.setLimit(0);
  const paused = await f.act(request, "forced");
  assert.equal(paused.decision, "ALLOWED");
  assert.notEqual(paused.data, null);
  assert.equal(paused.attemptEvidence!.status, "failed");
  assert.equal(f.fake.broadcasts(), 0);
  assert.deepEqual(await f.attempts.reconcile(paused.attemptEvidence!.record.attemptId), paused);
  f.setLimit(1);
  f.fake.options.rejected = true;
  const rejected = await f.act(request, "forced");
  assert.equal(rejected.attemptEvidence!.status, "failed");
  assert.equal(f.ledger.budgetStatus().reserved, 0);
  f.fake.options.rejected = false;
  assert.equal((await f.act(request, "forced")).attemptEvidence!.status, "recorded");
  assert.equal((await f.act(request, "forced")).attemptEvidence!.status, "failed");
});

test("unconfirmed recording rechecks read-only after pause, preserving identity/data/counter", async () => {
  const f = await setup();
  f.fake.options.unfinalized = true;
  f.fake.options.lost = true;
  const receipt = await f.act(request, "forced");
  assert.equal(receipt.attemptEvidence!.status, "pending");
  const attemptId = receipt.attemptEvidence!.record.attemptId;
  const counter = state.getCounter();
  f.setLimit(0);
  assert.equal((await f.attempts.reconcile(attemptId)).attemptEvidence!.status, "pending");
  f.fake.options.unfinalized = false;
  const confirmed = await f.attempts.reconcile(attemptId);
  assert.equal(confirmed.attemptEvidence!.status, "recorded");
  assert.equal(confirmed.attemptEvidence!.fingerprint, receipt.attemptEvidence!.fingerprint);
  assert.equal(confirmed.id, receipt.id);
  assert.equal(f.fake.broadcasts(), 1);
  assert.equal(f.reads(), 1);
  assert.equal(state.getCounter(), counter);
  assert.deepEqual(await f.attempts.reconcile(attemptId), confirmed);
});

test("zero cap fences legacy pending rebroadcasts and failed mined attempts never resend", async () => {
  const f = await setup();
  f.fake.options.unfinalized = true;
  const result = await f.ledger.recordFingerprint(id("pending"), () => {});
  assert.equal(result.status, "pending");
  f.setLimit(0);
  await assert.rejects(f.ledger.anchor(id("pending")), /paused/);
  assert.equal(f.fake.broadcasts(), 1);
  f.fake.options.unfinalized = false;
  f.fake.options.status = 0;
  assert.equal((await f.ledger.reconcileFingerprint(id("pending"), result.txHash!)).status, "failed");
  f.setLimit(20);
  assert.equal((await f.ledger.recordFingerprint(id("pending"), () => {})).status, "failed");
  assert.equal(f.fake.broadcasts(), 1);
});

test("an older unresolved transaction is never attached to a different attempt", async () => {
  const f = await setup();
  f.fake.options.unfinalized = true;
  const first = await f.act(request, "forced");
  const second = await f.act(request, "forced");
  assert.equal(first.attemptEvidence!.status, "pending");
  assert.equal(second.attemptEvidence!.status, "failed");
  assert.equal(second.attemptEvidence!.txHash, null);
  assert.match(second.attemptEvidence!.status === "failed" ? second.attemptEvidence!.detail : "", /not submitted/);
  assert.equal(f.fake.broadcasts(), 1);
});

test("reset during signing fences that submission and every already-queued action", async () => {
  const signer = fakeWallet();
  const fake = fakeMonad();
  const ledger = createMonadLedger(fake.rpc, () => signer, { maxTransactions: 2 });
  const generation = state.getGeneration();
  const fence = () => state.assertCurrentGeneration(generation);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const sign = signer.signTransaction.bind(signer);
  signer.signTransaction = async (tx) => { entered(); await gate; return sign(tx); };
  const first = ledger.recordFingerprint(id("sign-reset-first"), fence);
  await waiting;
  const second = ledger.recordFingerprint(id("sign-reset-queued"), fence);
  state.reset();
  release();
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(fake.broadcasts(), 0);
  assert.equal(ledger.budgetStatus().reserved, 0);
});

test("a reduced or paused allowance is rechecked after asynchronous signing", async () => {
  for (const reduced of [0, 1]) {
    const signer = fakeWallet();
    const fake = fakeMonad();
    let limit = 2;
    const ledger = createMonadLedger(fake.rpc, () => signer, { maxTransactions: () => limit });
    await ledger.recordFingerprint(id(`first-${reduced}`), () => {});
    const sign = signer.signTransaction.bind(signer);
    signer.signTransaction = async (tx) => { const raw = await sign(tx); limit = reduced; return raw; };
    const result = await ledger.recordFingerprint(id(`second-${reduced}`), () => {});
    assert.equal(result.status, "failed");
    assert.equal(fake.broadcasts(), 1);
    assert.equal(ledger.budgetStatus().reserved, 1);
  }
});

test("request-reference and check failures stop before data; stale HTTP contexts cannot refresh their generation", async () => {
  const f = await setup();
  for (const location of ["reference", "checks"]) {
    const work = createGateway({
      ...f.deps,
      latestReference: async () => { if (location === "reference") state.reset(); return reference; },
      evaluate: async () => { state.reset(); return checks(); },
    });
    if (!state.getSlip(MANDATE_ID)) state.addSlip(f.slip);
    await assert.rejects(work(request, "agent"), /reset/);
  }
  assert.equal(f.reads(), 0);
  const generation = state.getGeneration();
  await state.withResetGeneration(generation, async () => {
    state.reset();
    await assert.rejects(f.act(request, "agent"), /reset/);
  });
  assert.equal(f.fake.broadcasts(), 0);
  assert.equal(state.getCounter(), 0);
});

test("reset during RPC preparation cancels the queued send; old attempt IDs cannot touch reused receipt IDs", async () => {
  const f = await setup();
  f.fake.options.onGas = () => state.reset();
  await assert.rejects(f.act(request, "forced"), /reset/);
  assert.equal(f.fake.broadcasts(), 0);
  assert.equal(state.getCounter(), 0);
  f.fake.options.onGas = undefined;
  state.addSlip(f.slip);
  const old = await f.act(request, "forced");
  state.reset();
  state.addSlip(f.slip);
  const fresh = await f.act(request, "forced");
  assert.equal(old.id, fresh.id);
  await assert.rejects(f.attempts.reconcile(old.attemptEvidence!.record.attemptId), /reset/);
  assert.equal(state.getCounter(), 1);
  await assert.rejects(f.attempts.reconcile(randomUUID()), /unknown/);
});

test("corrupt or permission-substituted readback never becomes recorded", async () => {
  const mutations: ((e: LookupResult) => LookupResult)[] = [
    (e) => ({ ...e, chainId: 1 }), (e) => ({ ...e, from: "0xwrong" }), (e) => ({ ...e, to: "0xwrong" }),
    (e) => ({ ...e, value: "0x1" }), (e) => ({ ...e, status: 0 }), (e) => ({ ...e, data: id("permission") }),
    (e) => ({ ...e, blockHash: "bad" }), (e) => ({ ...e, blockNumber: 99 }),
    (e) => ({ ...e, finalized: false as unknown as true }),
  ];
  for (const mutate of mutations) {
    state.reset();
    const f = await setup();
    const service = createAttemptService({ state, chain: { ...f.chain, lookup: async (hash) => mutate((await f.ledger.lookup(hash))!) } });
    const act = createGateway({ ...f.deps, record: service.record });
    const receipt = await act(request, "forced");
    assert.equal(receipt.attemptEvidence!.status, "failed");
    assert.equal(receipt.decision, "ALLOWED");
  }
});

test("readback outage stays pending, unknown enums use other, and request snapshots cannot be mutated", async () => {
  const f = await setup();
  const service = createAttemptService({ state, chain: { ...f.chain, lookup: async () => { throw new Error("offline"); } } });
  const act = createGateway({ ...f.deps, record: service.record });
  const receipt = await act({ ...request, agentId: "private-person-marker", action: "private-salary-marker" }, "forced");
  assert.equal(receipt.attemptEvidence!.status, "pending");
  assert.equal(receipt.attemptEvidence!.record.agent, "other");
  assert.equal(receipt.attemptEvidence!.record.action, "other");
  assert.ok(!JSON.stringify(receipt.attemptEvidence).includes("private-"));
  const copy = state.getRequestContext(receipt.id)!;
  copy.originalSlip.mandate.allowedActions.push(forbidden);
  assert.deepEqual(state.getRequestContext(receipt.id)!.originalSlip.mandate.allowedActions, [allowed]);
  assert.equal(f.reads(), 0);
});

test("HTTP retry identity coalesces concurrent calls and rejects altered input and old sessions", async () => {
  const f = await setup();
  const once = createOperationCache();
  const key = randomUUID();
  const results = await Promise.all([1, 2].map(() => once(key, "act", request, () => f.act(request, "forced"))));
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.reads(), 1);
  assert.equal(f.fake.broadcasts(), 1);
  await assert.rejects(once(key, "act", { ...request, action: forbidden }, () => f.act(request, "forced")), /different input/);
  state.reset();
  await assert.rejects(once(key, "act", request, () => f.act(request, "forced")), /previous session/);
});

test("same-second block ordering and original request context produce a genuine late-permission rejection", async () => {
  const fake = fakeMonad();
  const ledger = createMonadLedger(fake.rpc, () => wallet, { maxTransactions: 4 });
  const evaluate = async (slip: Slip, action: string, _time: number, _agent: string = AGENT_ID, context?: OriginalRequestContext) => {
    const evidence = await ledger.lookup(slip.anchor!.txHash);
    const ordered = stampMatchesRequest(slip, evidence, context!.requestBlock, wallet.address);
    return checks().map((c) => c.id === "scope" ? { ...c, pass: slip.mandate.allowedActions.includes(action) } :
      c.id === "stamped" ? { ...c, pass: ordered, detail: ordered ? "" : "Stamped on Monad after this request" } : c);
  };
  const chain = { ...ledger, issuerAddressOrNull: () => wallet.address };
  const permission = createPermissionService({ state, chain, evaluate });
  await permission.issue("consulting");
  const attempts = createAttemptService({ state, chain });
  const act = createGateway({ state, latestReference: ledger.latestReference, evaluate, record: attempts.record, readData: () => ["allowed"] });
  const blocked: Receipt = await act({ ...request, action: forbidden }, "forced");
  assert.equal(blocked.decision, "BLOCKED");
  assert.equal(state.getRequestContext(blocked.id)!.resource, RESOURCE);
  const dispute = await permission.replayDispute();
  assert.equal(dispute.decision, "REJECTED");
  assert.deepEqual(dispute.checks.filter((c) => !c.pass).map((c) => c.id), ["stamped"]);
  assert.equal(dispute.attemptEvidence, undefined);
  assert.equal(dispute.actionTime, blocked.actionTime);
  assert.equal(state.getCounter(), 2);
  assert.equal(fake.broadcasts(), 3);
});
