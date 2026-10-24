// The ONLY importer of protected data. Authorization and audit recording are separate.
import type { ActRequest, Receipt } from "../../shared/contract";
import { RESOURCE } from "../../shared/contract";
import { randomUUID } from "node:crypto";
import { isHexString } from "ethers";
import { readEvaluationData } from "./gateway";
import * as chain from "../chain";
import type { OriginalRequestContext } from "../chain/evidence";
import { DEFAULT_SCENARIO_ID } from "../../shared/scenarios";
import { ACTIONS } from "../../shared/workspace";
import { httpError } from "../http";
import * as state from "../state";
import { assertRequestBlock, evaluate } from "./workspace-checks";

export { evaluate };

export const attempts = chain.createAttemptService({ state, chain });
type Dependencies = {
  state: Pick<typeof state, "getGeneration" | "assertCurrentGeneration" | "getSlip" | "addActionReceipt">;
  latestReference: typeof chain.latestReference;
  evaluate: typeof evaluate;
  record: typeof attempts.record;
  readData: (action: string) => unknown;
};

export function createGateway(deps: Dependencies) {
  return async function act(req: ActRequest, source: "agent" | "forced"): Promise<Receipt> {
    if (!req || typeof req !== "object" || Array.isArray(req) ||
        !["agent", "forced"].includes(source) ||
        [req.agentId, req.mandateId, req.action].some(value =>
          typeof value !== "string" || !value || value.length > 200 || value.trim() !== value)) {
      throw httpError(400, "A valid agent, permission, action and server-selected source are required.");
    }
    req = { agentId: req.agentId, mandateId: req.mandateId, action: req.action };
    if (typeof deps.state.addActionReceipt !== "function") {
      throw httpError(503, "Atomic request-evidence storage is unavailable.");
    }
    const generation = deps.state.getGeneration();
    deps.state.assertCurrentGeneration(generation);
    const attemptId = randomUUID(); // Allocate identity before the first await.
    const sourceSlip = deps.state.getSlip(req.mandateId);
    if (!sourceSlip) throw httpError(404, "No permission slip yet. Click Sign and stamp first.");
    if (sourceSlip.mandate.mandateId !== req.mandateId) throw httpError(503, "The loaded permission does not match the request.");
    const slip = structuredClone(sourceSlip);
    const originalJson = JSON.stringify(slip);
    const assertCurrent = () => {
      deps.state.assertCurrentGeneration(generation);
      if (deps.state.getSlip(req.mandateId) !== sourceSlip || JSON.stringify(sourceSlip) !== originalJson) {
        throw httpError(409, "The original permission changed; start the request again.");
      }
    };
    return chain.withChainDeadline(Date.now() + 8000, async () => {
      let requestBlock: Awaited<ReturnType<typeof chain.latestReference>>;
      try {
        requestBlock = structuredClone(await deps.latestReference());
        assertRequestBlock(requestBlock);
      } catch {
        assertCurrent();
        throw httpError(503, "A trustworthy original request block is unavailable.");
      }
      assertCurrent();
      if (!isHexString(slip.digest, 32)) {
        throw httpError(503, "A trustworthy original request block is unavailable.");
      }
      const context: OriginalRequestContext = {
        generation, originalSlip: slip, requestBlock,
        agentId: req.agentId, action: req.action, resource: RESOURCE, scenarioId: DEFAULT_SCENARIO_ID,
      };
      let checks: Awaited<ReturnType<typeof evaluate>>;
      try { checks = await deps.evaluate(slip, req.action, requestBlock.blockTimestamp, req.agentId, structuredClone(context)); }
      catch (error) { assertCurrent(); throw error; }
      assertCurrent();
      const order = ["signed", "agent", "valid", "stamped", "scope"];
      if (!Array.isArray(checks) || checks.length !== 5 || !order.every((id, i) => checks[i]?.id === id &&
          typeof checks[i].pass === "boolean" && typeof checks[i].label === "string" && typeof checks[i].detail === "string")) {
        throw httpError(503, "The permission checks could not be verified.");
      }
      if (!ACTIONS.some(action => action.id === req.action)) {
        checks = checks.map(check => check.id === "scope" ? { ...check, pass: false, detail: "This data action is unavailable." } : check);
      }
      const ok = checks.every((c) => c.pass);
      // No await between this generation check, protected access and receipt creation.
      assertCurrent();
      let data: unknown = null;
      if (ok) {
        try {
          data = deps.readData(req.action);
          if (data == null || data instanceof Promise) throw new Error("No synchronous data");
        } catch { assertCurrent(); throw httpError(503, "The permitted evaluation data could not be read."); }
      }
      assertCurrent();
      const receipt = deps.state.addActionReceipt({
        kind: "action", source, decision: ok ? "ALLOWED" : "BLOCKED",
        actionTime: requestBlock.blockTimestamp, checks, data,
        agentId: req.agentId, mandateId: req.mandateId, action: req.action,
        explorerUrl: slip.anchor?.explorerUrl ?? null,
      }, context, generation);
      return deps.record(receipt, context, attemptId);
    });
  };
}

export const act = createGateway({
  state, latestReference: chain.latestReference, evaluate, record: attempts.record,
  readData: readEvaluationData,
});
