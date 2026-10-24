// P2: normal actions use a captured finalized block. P1's existing four-argument
// evaluator remains an explicit time-based compatibility path, not context replay.
import type { Check, Slip } from "../../shared/contract";
import { AGENT_ID, CHAIN_ID, RESOURCE } from "../../shared/contract";
import { actionLabel, consulting, DEFAULT_SCENARIO_ID } from "../../shared/scenarios";
import { lookup, stampMatchesRequest, type ChainReference } from "../chain";
import { digestOf, issuerAddress, recoverSigner } from "../chain/slip";
import { httpError } from "../http";
import type { OriginalRequestContext } from "../chain/evidence";
import { createWorkspaceEvaluator } from "./workspace-checks";

// Test seams use the actual current P1 signatures; they do not define a new wire contract.
type CheckDependencies = {
  lookup: typeof lookup;
  digestOf: typeof digestOf;
  issuerAddress: typeof issuerAddress;
  recoverSigner: typeof recoverSigner;
};

export function assertFinalizedReference(reference: ChainReference): void {
  if (!reference || reference.chainId !== CHAIN_ID ||
      !Number.isSafeInteger(reference.blockNumber) || reference.blockNumber < 0 ||
      !Number.isSafeInteger(reference.blockTimestamp) || reference.blockTimestamp < 0 ||
      typeof reference.blockHash !== "string" || !/^0x[a-f0-9]{64}$/i.test(reference.blockHash)) {
    throw httpError(503, "The finalized Monad reference could not be verified.");
  }
}

type Ordering =
  | { kind: "finalized-block"; reference: ChainReference }
  | { kind: "legacy-time"; actionTime: number };

function createChecks(overrides: Partial<CheckDependencies>) {
  const dependencies = { lookup, digestOf, issuerAddress, recoverSigner, ...overrides };
  return async function checks(
    slip: Slip, action: string, ordering: Ordering, agentId: string,
  ): Promise<Check[]> {
    if (ordering.kind === "finalized-block") assertFinalizedReference(ordering.reference);
    const requestBlock = ordering.kind === "finalized-block" ? structuredClone(ordering.reference) : undefined;
    slip = structuredClone(slip);
    const actionTime = ordering.kind === "legacy-time" ? ordering.actionTime : ordering.reference.blockTimestamp;
    if (!Number.isSafeInteger(actionTime) || actionTime < 0) {
      throw httpError(503, "The original request time could not be verified.");
    }
    const m = slip.mandate;
    const label = actionLabel(action);
    let issuer: string;
    try {
      issuer = dependencies.issuerAddress().toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(issuer)) throw new Error("Missing trusted issuer.");
    } catch {
      throw httpError(503, "The trusted issuer could not be verified.");
    }

    let signer = "";
    try {
      signer = dependencies.recoverSigner(m, slip.signature);
    } catch {}

    let stampedPass = false;
    let stampedDetail = "No matching stamp on Monad";
    let want = "";
    try { want = dependencies.digestOf(m).toLowerCase(); } catch { /* Invalid mandate: cannot match a stamp. */ }
    if (slip.anchor && want) {
      let a;
      try {
        a = await dependencies.lookup(slip.anchor.txHash);
      } catch {
        // An outage is not a completed policy rejection. Never release data or issue a policy receipt.
        throw httpError(503, "Could not reach Monad to verify the stamp.");
      }
      if (!a || a.finalized !== true) {
        throw httpError(503, "The permission stamp is missing or is not finalized on Monad.");
      }
      assertFinalizedReference(a);
      if (a.blockNumber !== slip.anchor.blockNumber || a.blockTimestamp !== slip.anchor.blockTimestamp ||
          !Number.isSafeInteger(a.transactionIndex) || a.transactionIndex < 0) {
        throw httpError(503, "The permission stamp has inconsistent Monad evidence.");
      }
      // First verify the candidate against its OWN finalized evidence. A bad stamp
      // or an outage is never described as a successfully verified late permission.
      const matches = stampMatchesRequest(slip, a, a, issuer);
      if (matches) {
        if (requestBlock && a.blockNumber === requestBlock.blockNumber &&
            a.blockHash.toLowerCase() !== requestBlock.blockHash.toLowerCase()) {
          throw httpError(503, "The permission and request refer to inconsistent Monad blocks.");
        }
        stampedPass = requestBlock
          ? a.blockNumber <= requestBlock.blockNumber
          : a.blockTimestamp <= actionTime;
        if (!stampedPass) stampedDetail = "Stamped on Monad after this request";
      }
    }
    // Trusted route configuration, never expectations copied from the candidate or request.
    const bound = m.resource === RESOURCE && m.scenarioId === DEFAULT_SCENARIO_ID;
    const knownAction = action === consulting.allowed.name || action === consulting.forbidden.name;

    const checks: Check[] = [
      { id: "signed", label: "Signed by the client", pass: typeof signer === "string" && signer.toLowerCase() === issuer && typeof m.issuer === "string" && m.issuer.toLowerCase() === issuer, detail: `Not signed by ${consulting.client.name}` },
      { id: "agent", label: "The right AI", pass: agentId === m.agentId, detail: "This slip belongs to a different AI" },
      { id: "valid", label: "Still valid", pass: [m.issuedAt, m.expiresAt, actionTime].every(Number.isSafeInteger) && m.issuedAt <= actionTime && actionTime < m.expiresAt, detail: "This slip has expired or is not active yet" },
      { id: "stamped", label: "Stamped before request", pass: stampedPass, detail: stampedDetail },
      { id: "scope", label: `${label} on the slip`, pass: bound && knownAction && Array.isArray(m.allowedActions) && m.allowedActions.includes(action), detail: bound ? `${label} is not on this slip` : "This slip does not match the requested resource or scenario" },
    ];
    return checks.map((c) => (c.pass ? { ...c, detail: "" } : c));
  };
}

// Internal P2 verifier; the normal gateway is its only production caller.
// This is not the proposed OriginalRequestContext schema.
export function createEvaluator(overrides: Partial<CheckDependencies> = {}) {
  const checks = createChecks(overrides);
  return (slip: Slip, action: string, requestBlock: ChainReference, agentId: string = AGENT_ID) =>
    checks(slip, action, { kind: "finalized-block", reference: requestBlock }, agentId);
}

/**
 * Preserve the available P1 API: evaluate(slip, action, actionTime, caller).
 * P1 currently waits for the next integer second before its amended stamp.
 * This path never substitutes for a failed finalized-reference capture and never
 * claims immutable request context or same-timestamp replay protection.
 * Supplied context uses the same retained-block verifier as the persistent app.
 * Missing context retains the retired four-argument compatibility behavior only.
 */
export function createCompatibilityEvaluator(overrides: Partial<CheckDependencies> = {}) {
  const checks = createChecks(overrides);
  const withContext = createWorkspaceEvaluator(overrides);
  return async function evaluate(
    slip: Slip, action: string, actionTime: number, agentId: string = AGENT_ID, originalContext?: unknown,
  ): Promise<Check[]> {
    if (originalContext !== undefined) {
      return withContext(slip, action, actionTime, agentId, originalContext as OriginalRequestContext);
    }
    return checks(slip, action, { kind: "legacy-time", actionTime }, agentId);
  };
}

export const evaluateAtReference = createEvaluator();
export const evaluate = createCompatibilityEvaluator();
