// Reset fixtures only. No real signing, provider, protected tables or chain calls.
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Express } from "express";
import type { Check, Slip } from "../../../shared/contract";
import { AGENT_ID, CHAIN_ID, MANDATE_ID, RESOURCE } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import type { NewReceipt } from "../../state";
import type { ChainReference } from "../../chain";

export function reference(blockTimestamp = 150, blockNumber = 11): ChainReference {
  return { chainId: CHAIN_ID, blockNumber, blockTimestamp, blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}` };
}

export const slip: Slip = {
  mandate: {
    mandateId: MANDATE_ID, issuer: "reset-fixture", agentId: AGENT_ID, resource: RESOURCE,
    scenarioId: consulting.id, allowedActions: [consulting.allowed.name],
    issuedAt: 100, expiresAt: 200, nonce: "12345678",
  },
  signature: "reset-fixture", digest: "reset-fixture", label: "Original", anchor: null,
};

export const request = { agentId: AGENT_ID, mandateId: MANDATE_ID, action: consulting.allowed.name };

export function checks(action = consulting.allowed.name): Check[] {
  return (["signed", "agent", "valid", "stamped", "scope"] as const).map((id) => ({
    id, label: id, pass: id !== "scope" || action === consulting.allowed.name, detail: "",
  }));
}

export function receiptInput(): NewReceipt {
  return {
    ...request, kind: "action", source: "agent", decision: "ALLOWED", actionTime: 150,
    checks: checks(), data: [{ fixture: true }], explorerUrl: null,
  };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function withTestApp(app: Express, run: (base: string) => Promise<void>) {
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

export function post(base: string, path: string, body: unknown = {}) {
  return fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
