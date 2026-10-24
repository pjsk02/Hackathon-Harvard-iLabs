// Actual P1 digest/recovery/typed-data helpers; synthetic finalized ledger evidence.
// These verify P2's local reference boundary, NOT delivered retained-context integration or live finality.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Wallet } from "ethers";
import type { ActRequest, Check, Mandate, Receipt, Slip } from "../../../shared/contract";
import { AGENT_ID, RESOURCE } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import type { ChainReference, LookupResult } from "../../chain";
import { digestOf as digest, DOMAIN, TYPES, recoverSigner } from "../../chain/slip";
import { createCompatibilityEvaluator, createEvaluator } from "../checks";
import { createGateway } from "../gateway";
import { reference } from "./reset-fixtures";

const wallet = Wallet.createRandom(); // Ephemeral fixture only; never logged or persisted.
const records = new Map<string, LookupResult>();
let nextId = 0;
const checker = () => createEvaluator({
  issuerAddress: () => wallet.address,
  digestOf: digest,
  recoverSigner,
  lookup: async (hash) => records.get(hash) ?? null,
});

async function signed(changes: Partial<Mandate> = {}): Promise<Slip> {
  const mandate: Mandate = {
    mandateId: `fixture-${++nextId}`, issuer: wallet.address, agentId: AGENT_ID, resource: RESOURCE,
    scenarioId: consulting.id, allowedActions: [consulting.allowed.name],
    issuedAt: 900, expiresAt: 1100, nonce: "12345678", ...changes,
  };
  const txHash = `0x${nextId.toString(16).padStart(64, "0")}`;
  const fingerprint = digest(mandate);
  records.set(txHash, {
    ...reference(950, 10), from: wallet.address, to: wallet.address, data: fingerprint,
    value: "0x0", status: 1, transactionIndex: 0, finalized: true,
  });
  return {
    mandate, signature: await wallet.signTypedData(DOMAIN, TYPES, mandate), digest: fingerprint,
    label: "Original", anchor: { txHash, blockNumber: 10, blockTimestamp: 950, explorerUrl: "fixture-only" },
  };
}

function harness(slip: Slip, evaluate = checker(), latestReference = async () => reference(1000)) {
  let current: Slip | undefined = slip;
  const counters = { margins: 0, salaries: 0 };
  const receipts: Receipt[] = [];
  const act = createGateway({
    getSlip: () => current,
    addReceipt: (input) => {
      const receipt = { ...input, id: `fixture-${receipts.length}`, createdAt: "fixture-only" };
      receipts.push(receipt);
      return receipt;
    },
    latestReference,
    evaluate,
    data: {
      [consulting.allowed.name]: () => { counters.margins++; return [{ fixture: true }]; },
      [consulting.forbidden.name]: () => { counters.salaries++; return [{ fixture: true }]; },
    },
  });
  const request = { agentId: AGENT_ID, mandateId: slip.mandate.mandateId, action: consulting.allowed.name };
  return { act, request, counters, receipts, replace: (value?: Slip) => { current = value; } };
}

test("signed fixture: forced margins execute once; forbidden salaries execute zero times", async () => {
  const h = harness(await signed());
  assert.equal((await h.act(h.request, "forced")).decision, "ALLOWED");
  const denied = await h.act({ ...h.request, action: consulting.forbidden.name }, "forced");
  assert.equal(denied.decision, "BLOCKED");
  assert.equal(denied.data, null);
  assert.deepEqual(denied.checks.filter((check) => !check.pass).map((check) => check.id), ["scope"]);
  assert.deepEqual(h.counters, { margins: 1, salaries: 0 });
});

test("properly signed expired fixture fails valid only; wrong caller fails agent only", async () => {
  for (const expired of [true, false]) {
    const h = harness(await signed(expired ? { expiresAt: 999 } : {}));
    const result = await h.act({ ...h.request, agentId: expired ? AGENT_ID : "wrong" }, "forced");
    assert.deepEqual(result.checks.filter((check) => !check.pass).map((check) => check.id),
      [expired ? "valid" : "agent"]);
    assert.equal(result.decision, "BLOCKED");
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("tampered mandate invalidates real fixture signature and stamp; supplied digest cannot authorize", async () => {
  const slip = await signed();
  slip.mandate.allowedActions.push(consulting.forbidden.name);
  slip.digest = digest(slip.mandate);
  const h = harness(slip);
  const result = await h.act({ ...h.request, action: consulting.forbidden.name }, "forced");
  assert.deepEqual(result.checks.filter((check) => !check.pass).map((check) => check.id), ["signed", "stamped"]);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("wrong declared issuer, trusted resource and scenario fail without data", async () => {
  for (const changes of [
    { issuer: Wallet.createRandom().address }, { resource: "caller-chosen-resource" }, { scenarioId: "caller-chosen-scenario" },
  ]) {
    const h = harness(await signed(changes));
    const result = await h.act(h.request, "forced");
    assert.equal(result.decision, "BLOCKED");
    assert.ok(result.checks.some((check) => check.id === ("issuer" in changes ? "signed" : "scope") && !check.pass));
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("mismatched sender/destination/value/payload/status evidence never executes data", async () => {
  for (const change of [
    { from: "different-sender" }, { to: Wallet.createRandom().address }, { value: "1" },
    { data: "wrong-payload" }, { status: 0 },
  ]) {
    const slip = await signed();
    const hash = slip.anchor!.txHash;
    if (change) records.set(hash, { ...records.get(hash)!, ...change });
    else records.delete(hash);
    const h = harness(slip);
    const result = await h.act(h.request, "forced");
    assert.equal(result.decision, "BLOCKED");
    assert.ok(result.checks.some((check) => check.id === "stamped" && !check.pass));
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("unavailable verification is 503, has no policy receipt, and calls neither data reader", async () => {
  const evaluator = createEvaluator({
    issuerAddress: () => wallet.address, digestOf: digest,
    recoverSigner,
    lookup: async () => { throw new Error("isolated unavailable evidence"); },
  });
  const h = harness(await signed(), evaluator);
  await assert.rejects(h.act(h.request, "forced"), { status: 503 });
  assert.equal(h.receipts.length, 0);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("unknown actions cannot produce ALLOWED null even if an evaluator erroneously passes scope", async () => {
  const allPass: Check[] = (["signed", "agent", "valid", "stamped", "scope"] as const)
    .map((id) => ({ id, label: id, pass: true, detail: "" }));
  const h = harness(await signed(), async () => allPass);
  for (const action of ["unknown", "toString", "__proto__"]) {
    const result = await h.act({ ...h.request, action }, "forced");
    assert.equal(result.decision, "BLOCKED");
    assert.equal(result.data, null);
  }
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("reset/replacement during verification aborts before data access and receipt insertion", async () => {
  const slip = await signed();
  const evaluate = checker();
  let replace: () => void = () => {};
  const h = harness(slip, async (...args) => {
    const checks = await evaluate(...args);
    replace();
    return checks;
  });
  replace = () => h.replace();
  await assert.rejects(h.act(h.request, "agent"), { status: 409 });
  assert.equal(h.receipts.length, 0);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("candidate snapshot prevents in-place mutation during an await from authorizing extra scope", async () => {
  const slip = await signed();
  const evaluate = checker();
  const h = harness(slip, async (...args) => {
    slip.mandate.allowedActions.push(consulting.forbidden.name);
    return evaluate(...args);
  });
  const result = await h.act({ ...h.request, action: consulting.forbidden.name }, "forced");
  assert.equal(result.decision, "BLOCKED");
  assert.deepEqual(result.checks.filter((check) => !check.pass).map((check) => check.id), ["scope"]);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("malformed evaluator output and mismatched loaded permission fail operationally", async () => {
  const malformed = harness(await signed(), async () => []);
  await assert.rejects(malformed.act(malformed.request, "forced"), { status: 503 });
  assert.equal(malformed.receipts.length, 0);
  assert.deepEqual(malformed.counters, { margins: 0, salaries: 0 });
  const mismatch = harness(await signed());
  await assert.rejects(mismatch.act({ ...mismatch.request, mandateId: "different" }, "forced"), { status: 503 });
  assert.deepEqual(mismatch.counters, { margins: 0, salaries: 0 });
});

test("malformed action requests and unsupported sources fail before verification or any protected read", async () => {
  let evaluated = 0;
  let timeReads = 0;
  const evaluate = checker();
  const h = harness(await signed(), async (...args) => {
    evaluated++;
    return evaluate(...args);
  }, async () => { timeReads++; return reference(1000); });
  for (const request of [
    null, [], "request", {},
    { ...h.request, agentId: "" }, { ...h.request, agentId: ["actual-caller"] },
    { ...h.request, mandateId: " wrong " }, { ...h.request, mandateId: "x".repeat(201) },
    { ...h.request, action: {} }, { ...h.request, action: "" },
    { ...h.request, action: ["read_regional_margins"] },
  ]) {
    await assert.rejects(h.act(request as ActRequest, "forced"), { status: 400 });
  }
  for (const source of [undefined, null, "", "caller-selected", [], {}]) {
    await assert.rejects(h.act(h.request, source as "agent" | "forced"), { status: 400 });
  }
  assert.equal(evaluated, 0);
  assert.equal(timeReads, 0);
  assert.equal(h.receipts.length, 0);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("both server-selected sources are preserved; a missing slip reads no protected data", async () => {
  const h = harness(await signed());
  for (const source of ["agent", "forced"] as const) {
    const receipt = await h.act(h.request, source);
    assert.equal(receipt.source, source);
    assert.equal(receipt.decision, "ALLOWED");
  }
  assert.deepEqual(h.counters, { margins: 2, salaries: 0 });
  h.replace();
  await assert.rejects(h.act(h.request, "forced"), { status: 404 });
  assert.equal(h.receipts.length, 2);
  assert.deepEqual(h.counters, { margins: 2, salaries: 0 });
});

test("finalized-reference acquisition failure has no fallback, evaluation, receipt or data read", async () => {
  // Local gateway seam, not the still-pending persisted-context integration regression.
  for (const value of ["outage", undefined, { ...reference(), blockTimestamp: NaN },
    { ...reference(), blockNumber: -1 }, { ...reference(), blockHash: "wrong" },
    { ...reference(), chainId: 1 }]) {
    let attempts = 0;
    let evaluated = 0;
    const h = harness(await signed(), async () => { evaluated++; return []; }, async () => {
      attempts++;
      if (value === "outage") throw new Error("No chain evidence");
      return value as ChainReference;
    });
    await assert.rejects(h.act(h.request, "forced"), { status: 503 });
    assert.equal(attempts, 1, "Do not retry against a newer or mock boundary.");
    assert.equal(evaluated, 0);
    assert.equal(h.receipts.length, 0);
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("missing, unfinalized, wrong-network and inconsistent candidate evidence is unavailable, not a policy receipt", async () => {
  for (const change of [
    null, { finalized: false }, { chainId: 1 }, { blockHash: "wrong" },
    { blockNumber: -1 }, { blockTimestamp: NaN }, { transactionIndex: -1 }, { blockTimestamp: 951 },
  ]) {
    const slip = await signed();
    const hash = slip.anchor!.txHash;
    if (change) records.set(hash, { ...records.get(hash)!, ...change } as LookupResult);
    else records.delete(hash);
    const h = harness(slip);
    await assert.rejects(h.act(h.request, "forced"), { status: 503 });
    assert.equal(h.receipts.length, 0);
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("same timestamp is NOT ordering: N passes N+1, N+2 fails; no fresh reference is captured by the verifier", async () => {
  const original = await signed();
  const request = reference(950, 11);
  const before = structuredClone(request);
  const verifier = checker();
  assert.ok((await verifier(original, consulting.allowed.name, request)).every((check) => check.pass));
  const amendment = await signed({ allowedActions: [consulting.allowed.name, consulting.forbidden.name] });
  amendment.label = "Amended";
  amendment.anchor!.blockNumber = 12;
  records.set(amendment.anchor!.txHash, { ...records.get(amendment.anchor!.txHash)!, ...reference(950, 12) });
  const checks = await verifier(amendment, consulting.forbidden.name, request);
  assert.deepEqual(checks.filter((check) => !check.pass).map((check) => check.id), ["stamped"]);
  assert.equal(checks[3].detail, "Stamped on Monad after this request");
  assert.notEqual(amendment.digest, original.digest);
  assert.notEqual(amendment.mandate.mandateId, original.mandate.mandateId);
  assert.deepEqual(request, before);
  const legacy = createCompatibilityEvaluator({
    issuerAddress: () => wallet.address, lookup: async (hash) => records.get(hash) ?? null,
  });
  const compatibility = await legacy(amendment, consulting.forbidden.name, request.blockTimestamp, AGENT_ID);
  assert.ok(compatibility.every((check) => check.pass),
    "Known legacy limitation: a four-argument timestamp cannot distinguish equal-second blocks. Not context acceptance.");
});

test("compatibility verification outages still fail explicitly, never as a successful late rejection", async () => {
  const verifier = createCompatibilityEvaluator({
    issuerAddress: () => wallet.address,
    lookup: async () => { throw new Error("offline unavailable readback"); },
  });
  await assert.rejects(verifier(await signed(), consulting.allowed.name, 1000, AGENT_ID),
    { status: 503, message: "Could not reach Monad to verify the stamp." });
});

test("a missing finalized boundary never selects the legacy-time compatibility path", async () => {
  let lookups = 0;
  const verifier = createEvaluator({
    issuerAddress: () => wallet.address,
    lookup: async () => { lookups++; return null; },
  });
  const candidate = await signed();
  for (const missing of [undefined, null]) {
    await assert.rejects(verifier(candidate, consulting.allowed.name, missing as unknown as ChainReference, AGENT_ID),
      { status: 503, message: "The finalized Monad reference could not be verified." });
  }
  assert.equal(lookups, 0);
});

test("equal-height/different-hash candidate evidence cannot authorize", async () => {
  const slip = await signed();
  const h = harness(slip, checker(), async () => ({ ...reference(950, 10), blockHash: `0x${"ab".repeat(32)}` }));
  await assert.rejects(h.act(h.request, "forced"), { status: 503 });
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  assert.equal(h.receipts.length, 0);
});

test("actual P1 recovery rejects a signature from a different key or network", async () => {
  for (const wrongNetwork of [true, false]) {
    const slip = await signed();
    slip.signature = await (wrongNetwork ? wallet : Wallet.createRandom())
      .signTypedData(wrongNetwork ? { ...DOMAIN, chainId: 1 } : DOMAIN, TYPES, slip.mandate);
    const h = harness(slip);
    const receipt = await h.act(h.request, "forced");
    assert.deepEqual(receipt.checks.filter((check) => !check.pass).map((check) => check.id), ["signed", "stamped"]);
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});

test("a claimed digest cannot substitute for the independently rehashed signed mandate", async () => {
  const slip = await signed();
  slip.digest = `0x${"ab".repeat(32)}`;
  const h = harness(slip);
  const receipt = await h.act(h.request, "forced");
  assert.deepEqual(receipt.checks.filter((check) => !check.pass).map((check) => check.id), ["stamped"]);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("actual request values and the single captured block are cloned before later mutation", async () => {
  const slip = await signed();
  const captured = reference(1000);
  const verifier = checker();
  let reads = 0;
  let mutateRequest = () => {};
  const h = harness(slip, async (candidate, action, requestBlock, agent) => {
    captured.blockNumber = 0;
    captured.blockHash = reference(0, 0).blockHash;
    return verifier(candidate, action, requestBlock, agent);
  }, async () => {
    reads++;
    mutateRequest();
    return captured;
  });
  const original = { ...h.request };
  mutateRequest = () => {
    h.request.agentId = "changed-during-await";
    h.request.mandateId = "changed-during-await";
    h.request.action = consulting.forbidden.name;
  };
  const result = await h.act(h.request, "forced");
  assert.equal(result.agentId, original.agentId);
  assert.equal(result.mandateId, original.mandateId);
  assert.equal(result.action, original.action);
  assert.equal(result.decision, "ALLOWED");
  assert.equal(reads, 1);
  assert.deepEqual(h.counters, { margins: 1, salaries: 0 });
});

test("missing trusted signing identity fails before stamp lookup and protected access", async () => {
  let lookups = 0;
  const h = harness(await signed(), createEvaluator({
    issuerAddress: () => { throw new Error("private signing setup detail"); },
    lookup: async () => { lookups++; return null; },
  }));
  await assert.rejects(h.act(h.request, "forced"), { status: 503, message: "The trusted issuer could not be verified." });
  assert.equal(lookups, 0);
  assert.equal(h.receipts.length, 0);
  assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
});

test("even a genuinely signed grant listing an unknown action cannot execute it", async () => {
  for (const action of ["unknown", "toString", "__proto__"]) {
    const h = harness(await signed({ allowedActions: [action] }));
    const result = await h.act({ ...h.request, action }, "forced");
    assert.equal(result.decision, "BLOCKED");
    assert.deepEqual(result.checks.filter((check) => !check.pass).map((check) => check.id), ["scope"]);
    assert.equal(result.data, null);
    assert.deepEqual(h.counters, { margins: 0, salaries: 0 });
  }
});
