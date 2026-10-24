import assert from "node:assert/strict";
import { test } from "node:test";
import { createRpcClient, RpcWriteError } from "./rpc";

// All HTTP is intercepted in this test process; no keys, network or real writes.
const reply = (body: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, ...body as object }), {
  headers: { "Content-Type": "application/json" },
});
const chainReply = () => reply({ result: "0x279f" });

test("RPC sender classifies failure without exposing raw provider errors", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  await t.test("definite initial rejection is safe and sanitized", async () => {
    let sends = 0;
    globalThis.fetch = (async (_url, init) => {
      const { method } = JSON.parse(init!.body as string);
      if (method === "eth_chainId") return chainReply();
      sends++;
      return reply({ error: { code: -32000, message: "insufficient funds; PRIVATE_PROVIDER_DETAIL" } });
    }) as typeof fetch;
    await assert.rejects(createRpcClient(() => ["https://first.invalid", "https://second.invalid"])("eth_sendRawTransaction", ["0x00"], Date.now() + 1000), (error: unknown) => {
      assert.ok(error instanceof RpcWriteError);
      assert.equal(error.outcome, "rejected");
      assert.match(error.message, /insufficient test MON/);
      assert.doesNotMatch(error.message, /PRIVATE_PROVIDER_DETAIL/);
      return true;
    });
    assert.equal(sends, 1);
  });

  await t.test("timeout followed by a rejection does not become a definite failure", async () => {
    let sends = 0;
    globalThis.fetch = (async (url, init) => {
      const { method } = JSON.parse(init!.body as string);
      if (method === "eth_chainId") return chainReply();
      sends++;
      if (url === "https://first.invalid") throw new Error("Connection dropped after submission.");
      return reply({ error: { code: -32000, message: "insufficient funds" } });
    }) as typeof fetch;
    await assert.rejects(createRpcClient(() => ["https://first.invalid", "https://second.invalid"])("eth_sendRawTransaction", ["0x00"], Date.now() + 1000),
      (error: unknown) => error instanceof RpcWriteError && error.outcome === "uncertain");
    assert.equal(sends, 2);
  });

  await t.test("wrong network blocks submission before any signed bytes are posted", async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_url, init) => {
      const { method } = JSON.parse(init!.body as string);
      methods.push(method);
      return reply({ result: "0x1" });
    }) as typeof fetch;
    await assert.rejects(createRpcClient(() => ["https://wrong.invalid"])("eth_sendRawTransaction", ["0x00"], Date.now() + 1000),
      (error: unknown) => error instanceof RpcWriteError && error.outcome === "not-submitted");
    assert.deepEqual(methods, ["eth_chainId"]);
  });

  await t.test("already known and nonce-too-low outcomes must be reconciled", async () => {
    for (const message of ["already known", "nonce too low", "Unknown server error"]) {
      globalThis.fetch = (async (_url, init) => {
        const { method } = JSON.parse(init!.body as string);
        return method === "eth_chainId" ? chainReply() : reply({ error: { code: -32000, message } });
      }) as typeof fetch;
      await assert.rejects(createRpcClient(() => ["https://test.invalid"])("eth_sendRawTransaction", ["0x00"], Date.now() + 1000),
        (error: unknown) => error instanceof RpcWriteError && error.outcome === "uncertain");
    }
  });

  await t.test("a successful fallback can still return the accepted transaction hash", async () => {
    globalThis.fetch = (async (url, init) => {
      const { method } = JSON.parse(init!.body as string);
      if (method === "eth_chainId") return chainReply();
      if (url === "https://first.invalid") throw new Error("Lost response");
      return reply({ result: "0xabc" });
    }) as typeof fetch;
    const result = await createRpcClient(() => ["https://first.invalid", "https://second.invalid"])("eth_sendRawTransaction", ["0x00"], Date.now() + 1000);
    assert.equal(result, "0xabc");
  });
});
