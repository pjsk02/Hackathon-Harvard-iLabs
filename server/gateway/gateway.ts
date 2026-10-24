// P2: normal actions use one finalized boundary, never timestamp precedence.
// P1's existing time-based dispute API is exported separately. Persisted context
// and isolated-state extensions remain unapproved and are not imported here.
// This is the ONLY file allowed to import server/data.
import type { ActRequest, Receipt } from "../../shared/contract";
import { DATA } from "../data/northwind";
import { latestReference, type ChainReference } from "../chain";
import { httpError } from "../http";
import * as state from "../state";
import { assertFinalizedReference, evaluateAtReference } from "./checks";

export { evaluate } from "./checks";

type GatewayDependencies = {
  getSlip: typeof state.getSlip;
  addReceipt: typeof state.addReceipt;
  getResetGeneration: typeof state.getResetGeneration;
  assertCurrentGeneration: typeof state.assertCurrentGeneration;
  latestReference: typeof latestReference;
  evaluate: typeof evaluateAtReference;
  data: Record<string, () => unknown>;
};

export function createGateway(overrides: Partial<GatewayDependencies> = {}) {
  const dependencies: GatewayDependencies = {
    getSlip: state.getSlip, addReceipt: state.addReceipt,
    getResetGeneration: state.getResetGeneration, assertCurrentGeneration: state.assertCurrentGeneration,
    latestReference, evaluate: evaluateAtReference, data: DATA, ...overrides,
  };
  return async function act(req: ActRequest, source: "agent" | "forced"): Promise<Receipt> {
    // Source is chosen by the server entry point, never from the request body.
    if (source !== "agent" && source !== "forced") {
      throw httpError(400, "Request source must be agent or forced.");
    }
    if (!req || typeof req !== "object" || Array.isArray(req) ||
      [req.agentId, req.mandateId, req.action].some((value) =>
      typeof value !== "string" || !value || value.length > 200 || value.trim() !== value)) {
      throw httpError(400, "agentId, mandateId and action must be non-empty strings of at most 200 characters.");
    }
    // Stabilize caller values across awaits; this is not the future persisted evidence context.
    req = { agentId: req.agentId, mandateId: req.mandateId, action: req.action };
    const generation = dependencies.getResetGeneration();
    const slip = dependencies.getSlip(req.mandateId);
    if (!slip) throw httpError(404, "No permission slip yet. Click Sign and stamp first.");
    if (slip.mandate.mandateId !== req.mandateId) {
      throw httpError(503, "The loaded permission slip does not match the request.");
    }
    // Stabilize the candidate across awaits without inventing a persisted context schema.
    const candidate = structuredClone(slip);
    const assertCurrentSlip = () => {
      dependencies.assertCurrentGeneration(generation);
      if (dependencies.getSlip(req.mandateId) !== slip) {
        throw httpError(409, "The permission slip changed or the session was reset. Run the request again.");
      }
    };
    let requestBlock: ChainReference;
    try {
      requestBlock = structuredClone(await dependencies.latestReference());
      assertFinalizedReference(requestBlock);
    } catch {
      assertCurrentSlip();
      throw httpError(503, "Could not capture a finalized request reference on Monad.");
    }
    assertCurrentSlip();
    const actionTime = requestBlock.blockTimestamp; // Validity/display only.
    let checks: Awaited<ReturnType<typeof evaluateAtReference>>;
    try {
      checks = await dependencies.evaluate(candidate, req.action, requestBlock, req.agentId);
    } catch (error) {
      assertCurrentSlip();
      throw error;
    }
    // Generation catches Reset even when the very same slip object/ID is reinserted.
    assertCurrentSlip();
    const order = ["signed", "agent", "valid", "stamped", "scope"];
    if (!Array.isArray(checks) || checks.length !== order.length ||
        checks.some((check, index) => !check || check.id !== order[index] || typeof check.pass !== "boolean" ||
          typeof check.label !== "string" || typeof check.detail !== "string")) {
      throw httpError(503, "The permission checks could not be verified.");
    }
    const fn = Object.hasOwn(dependencies.data, req.action) ? dependencies.data[req.action] : undefined;
    const executable = typeof fn === "function";
    const safeChecks = checks.map((check) => check.id === "scope" && !executable
      ? { ...check, pass: false, detail: "This action is not available from Northwind." } : check);
    const ok = safeChecks.every((c) => c.pass);
    let data: unknown = null;
    assertCurrentSlip();
    if (ok) {
      try {
        data = fn!();
        if (data == null || data instanceof Promise) throw new Error("No synchronous data.");
      } catch {
        assertCurrentSlip();
        throw httpError(503, "Northwind's data could not be read.");
      }
    }
    assertCurrentSlip();
    return dependencies.addReceipt({
      kind: "action", source, decision: ok ? "ALLOWED" : "BLOCKED", actionTime,
      checks: safeChecks, data, agentId: req.agentId, mandateId: req.mandateId, action: req.action,
      explorerUrl: candidate.anchor?.explorerUrl ?? null,
    }, generation);
  };
}

export const act = createGateway();
