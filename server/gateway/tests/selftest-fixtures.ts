// OFFLINE FIXTURE ONLY: real P1 issuance/signatures, synthetic ledger and injected
// replay. This is NOT a delivered P3 state/context factory or production integration.
import type { Receipt, Slip } from "../../../shared/contract";
import { AMENDED_MANDATE_ID, MANDATE_ID } from "../../../shared/contract";
import { consulting } from "../../../shared/scenarios";
import { createMockLedger } from "../../chain/mockLedger";
import { createPermissionService, type PermissionState } from "../../chain/permission-service";
import { buildMandate, signMandate } from "../../chain/slip";
import { stampMatchesRequest, type ChainReference } from "../../chain";
import { httpError } from "../../http";
import { createCompatibilityEvaluator, createEvaluator } from "../checks";
import { createGateway } from "../gateway";
import type { SelftestSession } from "../../routes/selftest";
import type { NewReceipt } from "../../state";

export function selftestFixture() {
  let generation = 0;
  let nextId = 0;
  const slips = new Map<string, Slip>();
  const receipts: Receipt[] = [];
  const trace: string[] = [];
  const counts = { margins: 0, salaries: 0, captures: 0, closed: 0 };
  // Equal timestamps intentionally; hashes/heights distinguish ordering.
  let clock = 1_792_850_000_000;
  const ledger = createMockLedger(() => clock);
  const chain = {
    ...ledger,
    latestReference: async () => { ledger.advanceBlocks(); return ledger.latestReference(); },
  };
  const assertCurrentGeneration = (expected: number) => {
    if (generation !== expected) throw httpError(409, "The isolated fixture was reset.");
  };
  const addReceipt = (input: NewReceipt, expected = generation) => {
    assertCurrentGeneration(expected);
    const receipt: Receipt = { ...input, id: `offline-${++nextId}`, createdAt: "2026-10-24T00:00:00Z" };
    receipts.push(receipt);
    return receipt;
  };
  const state: PermissionState = {
    getGeneration: () => generation,
    getSlip: (id) => slips.get(id),
    addSlip: (slip, expected = generation) => {
      assertCurrentGeneration(expected);
      slips.set(slip.mandate.mandateId, slip);
      return slip;
    },
    getReceipt: (id) => receipts.find((r) => r.id === id),
    listReceipts: () => [...receipts].reverse(),
    addReceipt,
  };
  const permissions = createPermissionService({
    state, chain, evaluate: createCompatibilityEvaluator({ lookup: ledger.lookup }),
  });
  const verifier = createEvaluator({ lookup: ledger.lookup });
  let lastReference: ChainReference;
  const gateway = createGateway({
    getSlip: state.getSlip, addReceipt, getResetGeneration: () => generation, assertCurrentGeneration,
    latestReference: async () => {
      counts.captures++;
      lastReference = await chain.latestReference();
      return structuredClone(lastReference);
    },
    evaluate: verifier,
    data: {
      [consulting.allowed.name]: () => {
        counts.margins++;
        // Sentinel rows, not a second copy of protected demo data.
        return ["fixture-a", "fixture-b", "fixture-c", "fixture-d"]
          .map((region) => ({ region, revenueM: 1, marginPct: 2, changePts: 0 }));
      },
      [consulting.forbidden.name]: () => { counts.salaries++; throw new Error("No salary reader is permitted."); },
    },
  });
  const session: SelftestSession = {
    evidence: "offline-fixture",
    close: async () => { counts.closed++; },
    client: {
      reset: async () => { trace.push("isolated reset"); generation++; slips.clear(); receipts.splice(0); nextId = 0; },
      createSlip: async () => { trace.push("original"); return permissions.issue(consulting.id); },
      act: async (action) => {
        trace.push(action);
        const original = state.getSlip(MANDATE_ID)!;
        return gateway({ agentId: original.mandate.agentId, mandateId: MANDATE_ID, action }, "forced");
      },
      getSlip: state.getSlip,
      verifyStamp: async (slip) => {
        if (!stampMatchesRequest(slip, await chain.lookup(slip.anchor!.txHash), await chain.latestReference())) {
          throw httpError(503, "The offline permission evidence is unavailable.");
        }
      },
      dispute: async () => {
        // An explicit runner fixture, NOT P1 replay or persisted P3 original context.
        trace.push("injected replay");
        const original = state.getSlip(MANDATE_ID)!;
        const blocked = receipts.at(-1)!;
        const frozenReference = structuredClone(lastReference);
        const mandate = buildMandate({
          scenarioId: consulting.id, mandateId: AMENDED_MANDATE_ID,
          allowedActions: [consulting.allowed.name, consulting.forbidden.name],
          issuedAt: original.mandate.issuedAt - 3600, expiresAt: original.mandate.expiresAt,
        });
        const signed = await signMandate(mandate);
        const amended: Slip = { mandate, ...signed, label: "Amended", anchor: await chain.anchor(signed.digest) };
        const checks = await verifier(amended, blocked.action, frozenReference, blocked.agentId);
        state.addSlip(amended, generation);
        return addReceipt({
          kind: "dispute", source: "forced", decision: "REJECTED", actionTime: blocked.actionTime,
          checks, data: null, agentId: blocked.agentId, action: blocked.action,
          mandateId: AMENDED_MANDATE_ID, explorerUrl: amended.anchor!.explorerUrl,
        }, generation);
      },
    },
  };
  return {
    session, counts, trace, receipts, slips, permissions, generation: () => generation,
    advanceSecond: () => { clock += 1000; },
  };
}
