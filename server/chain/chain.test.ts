import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Wallet, Transaction, id, keccak256 } from "ethers";
import { buildMandate, digestOf, issuerAddress, recoverSigner, signMandate } from "./slip";
import { createMonadLedger as createLedger } from "./ledger";
import { createMockLedger } from "./mockLedger";
import { stampMatchesRequest } from "./evidence";
import { ChainError, RpcWriteError, createRpcClient, type RpcCall } from "./rpc";
import { mondayNineNY, slipsRouter } from "../routes/slips";
import { act } from "../gateway/workspace-gateway";
import * as state from "../state";
import express from "express";
import { errorHandler } from "../http";
import type { AddressInfo } from "node:net";
import type { Mandate, Slip } from "../../shared/contract";

// Fresh, unfunded, process-local test key. Never writes a key to disk or prints it.
const wallet = new Wallet(Wallet.createRandom().privateKey);
const createMonadLedger = (rpc: RpcCall, signer = () => wallet) =>
  createLedger(rpc, signer, { maxTransactions: 20 });
process.env.ISSUER_PRIVATE_KEY = wallet.privateKey;
process.env.MOCK_CHAIN = "1";
after(() => { delete process.env.ISSUER_PRIVATE_KEY; });
const allowed = "read_regional_margins";
const forbidden = "read_employee_salaries";
const make = () => buildMandate({ scenarioId: "consulting", allowedActions: [allowed], issuedAt: 1792850000 });
const hex = (n: number) => `0x${n.toString(16)}`;
const blockHash = (n: number) => id(`block-${n}`);

function transport(options: { unfinalized?: boolean; mismatched?: boolean; status?: number; lostBroadcastReply?: boolean } = {}) {
  let height = 100;
  let broadcasts = 0;
  let nonce = 0;
  const records = new Map<string, { tx: Transaction; height: number }>();
  const rpc: RpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
    let result: unknown;
    if (method === "eth_getBlockByNumber") {
      const number = params[0] === "finalized" ? (options.unfinalized ? 100 : height) : Number(BigInt(params[0] as string));
      result = { number: hex(number), hash: blockHash(number), timestamp: hex(1792850000) };
    } else if (method === "eth_getTransactionCount") {
      result = hex(nonce);
    } else if (method === "eth_gasPrice") {
      result = "0x174876e800";
    } else if (method === "eth_sendRawTransaction") {
      broadcasts++;
      const raw = params[0] as string;
      const hash = keccak256(raw);
      if (!records.has(hash)) {
        const tx = Transaction.from(raw);
        assert.equal(tx.nonce, nonce++);
        assert.equal(tx.chainId, 10143n);
        assert.equal(tx.value, 0n);
        records.set(hash, { tx, height: ++height });
      }
      if (options.lostBroadcastReply) throw new ChainError("Simulated lost broadcast reply");
      result = hash;
    } else if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") {
      const hash = params[0] as string;
      const record = records.get(hash);
      result = !record ? null : method === "eth_getTransactionReceipt" ? {
        transactionHash: hash, blockHash: options.mismatched ? id("wrong") : blockHash(record.height),
        blockNumber: hex(record.height), status: hex(options.status ?? 1), transactionIndex: "0x0",
      } : {
        hash, from: record.tx.from, to: record.tx.to, input: record.tx.data, value: "0x0",
        blockNumber: hex(record.height), blockHash: blockHash(record.height),
      };
    } else {
      throw new Error(`Unexpected method ${method}`);
    }
    return result as T;
  };
  return { rpc, records, options, broadcasts: () => broadcasts };
}

test("real ledgers default to paused and enforce a unique transaction budget", async () => {
  const fake = transport();
  const paused = createLedger(fake.rpc, () => wallet);
  await assert.rejects(paused.anchor(id("paused")), /paused until a test limit is approved/);
  assert.equal(fake.broadcasts(), 0);
  const ledger = createLedger(fake.rpc, () => wallet, { maxTransactions: 1 });
  const first = await ledger.anchor(id("budget-one"));
  assert.deepEqual(await ledger.anchor(id("budget-one")), first);
  await assert.rejects(ledger.anchor(id("budget-two")), /limit has been reached/);
  state.reset(); // Resetting UI/session state cannot replenish the sender's budget.
  await assert.rejects(ledger.anchor(id("budget-three")), /limit has been reached/);
  assert.deepEqual(ledger.budgetStatus(), { limit: 1, reserved: 1, pendingTxHash: null });
  assert.equal(fake.broadcasts(), 1);
});

test("invalid transaction limits and high gas prices fail before broadcast", async () => {
  const fake = transport();
  for (const maxTransactions of [-1, 1.5, Number.NaN, Infinity]) {
    await assert.rejects(createLedger(fake.rpc, () => wallet, { maxTransactions }).anchor(id("invalid-limit")), /nonnegative integer/);
  }
  const ledger = createLedger(fake.rpc, () => wallet, { maxTransactions: 1, maxGasPriceWei: 1n });
  await assert.rejects(ledger.anchor(id("too-expensive")), /gas price exceeds/);
  assert.equal(fake.broadcasts(), 0);
  assert.equal(ledger.budgetStatus().reserved, 0);
});

test("proven initial rejection releases the pending transaction and budget reservation", async () => {
  for (const outcome of ["rejected", "not-submitted"] as const) {
    const fake = transport();
    let reject = true;
    const rpc: RpcCall = async (method, params, deadline) => {
      if (method === "eth_sendRawTransaction" && reject) {
        reject = false;
        throw new RpcWriteError("Submission was definitely not accepted.", outcome);
      }
      return fake.rpc(method, params, deadline);
    };
    const ledger = createLedger(rpc, () => wallet, { maxTransactions: 1 });
    await assert.rejects(ledger.anchor(id(`rejected-${outcome}`)), /definitely not accepted/);
    assert.deepEqual(ledger.budgetStatus(), { limit: 1, reserved: 0, pendingTxHash: null });
    const stamp = await ledger.anchor(id(`next-${outcome}`));
    assert.ok(stamp.txHash);
    assert.equal(fake.broadcasts(), 1);
    assert.equal(ledger.budgetStatus().reserved, 1);
  }
});

test("uncertain submission followed by rejection retains identical bytes and blocks new issuance", async () => {
  const fake = transport();
  const sent: string[] = [];
  const rpc: RpcCall = async (method, params, deadline) => {
    if (method === "eth_sendRawTransaction") {
      sent.push(params[0] as string);
      throw new RpcWriteError("Unresolved submission.", sent.length === 1 ? "uncertain" : "rejected");
    }
    return fake.rpc(method, params, deadline);
  };
  const ledger = createLedger(rpc, () => wallet, { maxTransactions: 2, operationMs: 120 });
  await assert.rejects(ledger.anchor(id("first-unknown")), ChainError);
  const pendingHash = ledger.budgetStatus().pendingTxHash;
  assert.ok(pendingHash);
  await assert.rejects(ledger.anchor(id("must-not-replace")), ChainError);
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.deepEqual(ledger.budgetStatus(), { limit: 2, reserved: 1, pendingTxHash: pendingHash });
  assert.equal(fake.records.size, 0);
});

test("failed mined transactions consume the send budget while lost replies do not consume it twice", async () => {
  const failed = transport({ status: 0 });
  const failedLedger = createLedger(failed.rpc, () => wallet, { maxTransactions: 1 });
  await assert.rejects(failedLedger.anchor(id("failed-but-paid")), /does not match/);
  await assert.rejects(failedLedger.anchor(id("over-budget")), /limit has been reached/);
  const lost = transport({ lostBroadcastReply: true });
  const ledger = createLedger(lost.rpc, () => wallet, { maxTransactions: 1 });
  await ledger.anchor(id("accepted-with-lost-reply"));
  await ledger.anchor(id("accepted-with-lost-reply"));
  assert.equal(ledger.budgetStatus().reserved, 1);
  assert.equal(lost.broadcasts(), 1);
});

test("genuine EIP-712 signing recovers the configured issuer", async () => {
  const mandate = make();
  const signed = await signMandate(mandate);
  assert.equal(signed.digest, digestOf(mandate));
  assert.equal(recoverSigner(mandate, signed.signature), issuerAddress());
});

test("each of the nine signed fields binds the original signature and digest", async () => {
  const mandate = make();
  const signed = await signMandate(mandate);
  const mutations: Partial<Mandate>[] = [
    { mandateId: "different" }, { issuer: Wallet.createRandom().address },
    { agentId: "other-agent" }, { resource: "other-resource" }, { scenarioId: "other-scenario" },
    { allowedActions: [forbidden] }, { issuedAt: mandate.issuedAt - 1 },
    { expiresAt: mandate.expiresAt + 1 }, { nonce: "aabbccdd" },
  ];
  for (const change of mutations) {
    const modified = { ...mandate, ...change };
    assert.notEqual(digestOf(modified), signed.digest);
    assert.notEqual(recoverSigner(modified, signed.signature), issuerAddress());
  }
});

test("reject extra unsigned fields, milliseconds, floats, bad nonce, and invalid expiry", () => {
  for (const change of [
    { extra: "unsigned" }, { issuedAt: 1792850000000 }, { issuedAt: 1.5 },
    { nonce: "not-hex!" }, { expiresAt: 1 }, { allowedActions: [] },
  ]) assert.throws(() => digestOf({ ...make(), ...change }));
});

test("signing refuses a permission naming a different issuer", async () => {
  await assert.rejects(signMandate({ ...make(), issuer: Wallet.createRandom().address }), /issuer does not match/);
});

test("real ledger signs self-transactions, reads finalized evidence, serializes sends and deduplicates retries", async () => {
  const fake = transport();
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  const [first, second] = await Promise.all([ledger.anchor(id("first")), ledger.anchor(id("second"))]);
  assert.notEqual(first.txHash, second.txHash);
  assert.equal(fake.records.size, 2);
  assert.equal((await ledger.lookup(first.txHash))?.finalized, true);
  assert.equal((await ledger.lookup(first.txHash))?.from, wallet.address);
  assert.deepEqual(await ledger.anchor(id("first")), first);
  assert.equal(fake.broadcasts(), 2);
  const lookup = (await ledger.lookup(first.txHash))!;
  lookup.data = "mutated";
  assert.equal((await ledger.lookup(first.txHash))?.data, id("first"));
});

test("broadcast-response loss is reconciled by its known signed transaction hash", async () => {
  const fake = transport({ lostBroadcastReply: true });
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  const result = await ledger.anchor(id("lost-reply"));
  assert.equal(fake.records.size, 1);
  assert.equal((await ledger.lookup(result.txHash))?.data, id("lost-reply"));
});

test("failed finalized transaction is not returned as a successful anchor; queue recovers", async () => {
  const fake = transport({ status: 0 });
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  await assert.rejects(ledger.anchor(id("failed")), /does not match/);
  fake.options.status = 1;
  assert.ok(await ledger.anchor(id("next")));
});

test("inconsistent canonical block hashes are rejected", async () => {
  const fake = transport({ mismatched: true });
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  await assert.rejects(ledger.anchor(id("inconsistent")), /inconsistent/);
});

test("unfinalized and unknown transactions do not become evidence", async () => {
  const fake = transport();
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  assert.equal(await ledger.lookup(id("unknown")), null);
  assert.equal(fake.records.size, 0);
  // Populate through a separate ledger so the tested ledger cannot use finalized cache.
  const first = await createMonadLedger(fake.rpc, () => wallet).anchor(id("not-finalized-here"));
  fake.options.unfinalized = true;
  assert.equal(await ledger.lookup(first.txHash), null);
});

test("RPC outages never use server time and invalid fingerprints never send transactions", async () => {
  const fake = transport();
  const ledger = createMonadLedger(fake.rpc, () => wallet);
  await assert.rejects(ledger.anchor("0x01"), /32-byte/);
  assert.equal(fake.broadcasts(), 0);
  const offline = createMonadLedger(async () => { throw new ChainError("Offline"); });
  await assert.rejects(offline.latestTimestamp(), /Offline/);
});

test("same-second later blocks fail stamp ordering while earlier blocks pass", async () => {
  const ledger = createMockLedger(() => 1792850000000);
  const mandate = make();
  const signed = await signMandate(mandate);
  const anchor = await ledger.anchor(signed.digest);
  const slip: Slip = { mandate, ...signed, anchor, label: "Original" };
  const evidence = await ledger.lookup(anchor.txHash);
  const requestBlock = await ledger.latestReference();
  assert.ok(stampMatchesRequest(slip, evidence, requestBlock));
  ledger.advanceBlocks();
  const laterAnchor = await ledger.anchor(signed.digest);
  assert.equal(laterAnchor.blockTimestamp, requestBlock.blockTimestamp);
  assert.equal(stampMatchesRequest({ ...slip, anchor: laterAnchor }, await ledger.lookup(laterAnchor.txHash), requestBlock), false);
  assert.equal(stampMatchesRequest({ ...slip, digest: id("substituted") }, evidence, requestBlock), false);
  assert.equal(stampMatchesRequest(slip, evidence, { ...requestBlock, blockHash: id("wrong") }), false);
});

test("Monday calculation uses New York time, including Monday before 9am and DST", () => {
  assert.equal(mondayNineNY(Date.parse("2026-10-24T15:00:00Z") / 1000), Date.parse("2026-10-19T13:00:00Z") / 1000);
  assert.equal(mondayNineNY(Date.parse("2026-10-19T12:00:00Z") / 1000), Date.parse("2026-10-12T13:00:00Z") / 1000);
  assert.equal(mondayNineNY(Date.parse("2026-11-07T15:00:00Z") / 1000), Date.parse("2026-11-02T14:00:00Z") / 1000);
  assert.equal(mondayNineNY(Date.parse("2026-11-02T13:00:00Z") / 1000), Date.parse("2026-10-26T13:00:00Z") / 1000);
  assert.equal(mondayNineNY(Date.parse("2026-03-09T12:00:00Z") / 1000), Date.parse("2026-03-02T14:00:00Z") / 1000);
});

test("HTTP integration: real signatures on explicit mock, allow/block/dispute, wrong agent, and missing prerequisites", async () => {
  state.reset();
  const app = express();
  app.use(express.json(), slipsRouter, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body = {}) => fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await post("/api/dispute")).status, 409);
    assert.equal((await post("/api/slips", { scenarioId: "__proto__" })).status, 400);
    const response = await post("/api/slips", { scenarioId: "consulting" });
    assert.equal(response.status, 200);
    const slip = await response.json() as Slip;
    assert.equal(recoverSigner(slip.mandate, slip.signature), issuerAddress());
    const retried = await (await post("/api/slips", { scenarioId: "consulting" })).json();
    assert.deepEqual(retried, slip);
    const request = { mandateId: slip.mandate.mandateId, agentId: slip.mandate.agentId, action: allowed };
    const margins = await act(request, "forced");
    assert.equal(margins.decision, "ALLOWED");
    assert.ok(margins.data);
    const wrong = await act({ ...request, agentId: "not-atlas" }, "forced");
    assert.deepEqual(wrong.checks.filter((c) => !c.pass).map((c) => c.id), ["agent"]);
    const blocked = await act({ ...request, action: forbidden }, "forced");
    assert.equal(blocked.decision, "BLOCKED");
    assert.equal(blocked.data, null);
    const disputedResponse = await post("/api/dispute");
    assert.equal(disputedResponse.status, 200);
    const disputed = await disputedResponse.json();
    assert.equal(disputed.decision, "REJECTED");
    assert.equal(disputed.actionTime, blocked.actionTime);
    assert.equal(disputed.data, null);
    assert.deepEqual(disputed.checks.filter((c: { pass: boolean }) => !c.pass).map((c: { id: string }) => c.id), ["stamped"]);
    assert.equal(state.getSlip(disputed.mandateId)?.mandate.expiresAt, slip.mandate.expiresAt);
    const counterBeforeRetry = state.getCounter();
    const retriedDispute = await (await post("/api/dispute")).json();
    assert.deepEqual(retriedDispute, disputed);
    assert.equal(state.getCounter(), counterBeforeRetry);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    state.reset();
  }
});

test("RPC transport rejects wrong network, bounds attempts and hides provider details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }));
  try {
    await assert.rejects(createRpcClient(() => ["https://wrong.invalid"])("eth_blockNumber", [], Date.now() + 500), /not connected to Monad testnet/);
    await assert.rejects(createRpcClient(() => ["https://wrong.invalid"])("eth_blockNumber", [], Date.now() - 1), /timed out/);
  } finally { globalThis.fetch = originalFetch; }
});
