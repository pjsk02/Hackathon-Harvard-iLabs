// Protected-data expectations stay under server/data; only gateway.ts imports northwind.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Slip } from "../../../shared/contract";
import { AGENT_ID, RESOURCE } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { createGateway } from "../../gateway/gateway";
import { reference } from "../../gateway/tests/reset-fixtures";

test("actual protected margins match Demo data exactly and callers receive separate row copies", async () => {
  const slip: Slip = {
    mandate: {
      mandateId: "data-fixture", issuer: "fixture-only", agentId: AGENT_ID, resource: RESOURCE,
      scenarioId: consulting.id, allowedActions: [consulting.allowed.name],
      issuedAt: 1, expiresAt: 3, nonce: "12345678",
    },
    signature: "fixture-only", digest: "fixture-only", label: "Original", anchor: null,
  };
  const act = createGateway({
    getSlip: () => slip,
    latestReference: async () => reference(2),
    evaluate: async () => (["signed", "agent", "valid", "stamped", "scope"] as const)
      .map((id) => ({ id, label: id, pass: true, detail: "" })),
    addReceipt: (input) => ({ ...input, id: "fixture-only", createdAt: "" }),
  });
  const request = { agentId: AGENT_ID, mandateId: "data-fixture", action: consulting.allowed.name };
  const first = await act(request, "forced");
  const expected = [
    { region: "West", revenueM: 52.7, marginPct: 24.1, changePts: 0.8 },
    { region: "Northeast", revenueM: 48.2, marginPct: 21.4, changePts: 0.3 },
    { region: "Midwest", revenueM: 36.5, marginPct: 18.7, changePts: -1.1 },
    { region: "South", revenueM: 41.9, marginPct: 16.2, changePts: -1.9 },
  ];
  assert.deepEqual(first.data, expected);
  (first.data as { region: string }[])[0].region = "mutated by caller";
  assert.deepEqual((await act(request, "forced")).data, expected);
});

test("all ten fictional employee rows match Demo data and stay isolated across returned copies", async () => {
  // Fixture-integrity test only: a test-injected all-pass evaluator allows this explicit read.
  // The original demo permission still forbids this action; denial tests count zero invocations.
  const slip: Slip = {
    mandate: {
      mandateId: "salary-data-fixture", issuer: "fixture-only", agentId: AGENT_ID, resource: RESOURCE,
      scenarioId: consulting.id, allowedActions: [consulting.forbidden.name],
      issuedAt: 1, expiresAt: 3, nonce: "12345678",
    },
    signature: "fixture-only", digest: "fixture-only", label: "Original", anchor: null,
  };
  const act = createGateway({
    getSlip: () => slip,
    latestReference: async () => reference(2),
    evaluate: async () => (["signed", "agent", "valid", "stamped", "scope"] as const)
      .map((id) => ({ id, label: id, pass: true, detail: "" })),
    addReceipt: (input) => ({ ...input, id: "fixture-only", createdAt: "" }),
  });
  const expected = [
    { id: "E01", name: "Maya Chen", role: "Regional Director", region: "Northeast", baseSalaryUsd: 182000 },
    { id: "E02", name: "Daniel Okafor", role: "Regional Director", region: "Midwest", baseSalaryUsd: 176500 },
    { id: "E03", name: "Lucia Ramirez", role: "Regional Director", region: "South", baseSalaryUsd: 171000 },
    { id: "E04", name: "Tom Becker", role: "Regional Director", region: "West", baseSalaryUsd: 188000 },
    { id: "E05", name: "Priya Nair", role: "Finance Manager", region: "HQ", baseSalaryUsd: 142000 },
    { id: "E06", name: "Grace Liu", role: "Merchandising Lead", region: "West", baseSalaryUsd: 118000 },
    { id: "E07", name: "Jonah Weiss", role: "Supply Chain Analyst", region: "HQ", baseSalaryUsd: 96000 },
    { id: "E08", name: "Marco Rossi", role: "Store Manager", region: "Northeast", baseSalaryUsd: 88000 },
    { id: "E09", name: "Sam Whitaker", role: "Store Manager", region: "Midwest", baseSalaryUsd: 84500 },
    { id: "E10", name: "Aisha Bello", role: "Store Manager", region: "South", baseSalaryUsd: 79000 },
  ];
  const request = { agentId: AGENT_ID, mandateId: slip.mandate.mandateId, action: consulting.forbidden.name };
  const first = await act(request, "forced");
  assert.deepEqual(first.data, expected);
  (first.data as { baseSalaryUsd: number }[])[0].baseSalaryUsd = 0;
  (first.data as unknown[]).pop();
  assert.deepEqual((await act(request, "forced")).data, expected);
});
