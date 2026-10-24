// The ONLY importer of protected data. Authorization and audit recording are separate.
import type { ActRequest, Receipt } from "../../shared/contract";
import { CHAIN_ID, RESOURCE } from "../../shared/contract";
import { randomUUID } from "node:crypto";
import { isHexString } from "ethers";
import { readEvaluationData } from "./gateway";
import * as chain from "../chain";
import type { OriginalRequestContext } from "../chain/evidence";
import { DEFAULT_SCENARIO_ID } from "../../shared/scenarios";
import { httpError } from "../http";
import * as state from "../state";
import { evaluate } from "./workspace-checks";

export { evaluate };

export const attempts = chain.createAttemptService({ state, chain });
type Dependencies = {
  state: typeof state;
  latestReference: typeof chain.latestReference;
  evaluate: typeof evaluate;
  record: typeof attempts.record;
  readData: (action: string) => unknown;
};

export function createGateway(deps: Dependencies) {
  return async function act(req: ActRequest, source: "agent" | "forced"): Promise<Receipt> {
    const generation = deps.state.getGeneration();
    deps.state.assertCurrentGeneration(generation);
    const attemptId = randomUUID(); // Allocate identity before the first await.
    const sourceSlip = deps.state.getSlip(req.mandateId);
    if (!sourceSlip) throw httpError(404, "No permission slip yet. Click Sign and stamp first.");
    const slip = structuredClone(sourceSlip);
    return chain.withChainDeadline(Date.now() + 8000, async () => {
      const requestBlock = await deps.latestReference();
      deps.state.assertCurrentGeneration(generation);
      if (requestBlock.chainId !== CHAIN_ID || !isHexString(requestBlock.blockHash, 32) ||
        !Number.isSafeInteger(requestBlock.blockNumber) || requestBlock.blockNumber < 0 ||
        !Number.isSafeInteger(requestBlock.blockTimestamp) || requestBlock.blockTimestamp < 0 ||
        !isHexString(slip.digest, 32)) {
        throw httpError(503, "A trustworthy original request block is unavailable.");
      }
      const context: OriginalRequestContext = {
        generation, originalSlip: slip, requestBlock,
        agentId: req.agentId, action: req.action, resource: RESOURCE, scenarioId: DEFAULT_SCENARIO_ID,
      };
      const checks = await deps.evaluate(slip, req.action, requestBlock.blockTimestamp, req.agentId, context);
      deps.state.assertCurrentGeneration(generation);
      const order = ["signed", "agent", "valid", "stamped", "scope"];
      if (checks.length !== 5 || !order.every((id, i) => checks[i].id === id && typeof checks[i].pass === "boolean")) {
        throw httpError(503, "The permission checks could not be verified.");
      }
      const ok = checks.every((c) => c.pass);
      // No await between this generation check, protected access and receipt creation.
      const data = ok ? deps.readData(req.action) : null;
      const receipt = deps.state.addReceipt({
        kind: "action", source, decision: ok ? "ALLOWED" : "BLOCKED",
        actionTime: requestBlock.blockTimestamp, checks, data,
        agentId: req.agentId, mandateId: req.mandateId, action: req.action,
        explorerUrl: slip.anchor?.explorerUrl ?? null,
      }, generation);
      deps.state.saveRequestContext(receipt.id, context);
      return deps.record(receipt, context, attemptId);
    });
  };
}

/** Local receipts are retained for every decision; only scope violations are public. */
export function scopeViolationRecorder(record: typeof attempts.record): typeof attempts.record {
  return async (receipt, context, attemptId) => {
    const outsideScope = receipt.kind === "action" && receipt.decision === "BLOCKED" &&
      receipt.checks.some(check => check.id === "scope" && !check.pass);
    return outsideScope ? record(receipt, context, attemptId) : receipt;
  };
}
export const act = createGateway({
  state, latestReference: chain.latestReference, evaluate, record: scopeViolationRecorder(attempts.record),
  readData: readEvaluationData,
});
