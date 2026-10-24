// Verify each candidate against the saved request boundary, never a new clock.
import type { Check, Slip } from "../../shared/contract";
import { AGENT_ID, CHAIN_ID, RESOURCE } from "../../shared/contract";
import { actionLabel, ACTIONS } from "../../shared/workspace";
import { DEFAULT_SCENARIO_ID, consulting } from "../../shared/scenarios";
import { lookup, type ChainReference } from "../chain";
import { digestOf, issuerAddress, recoverSigner } from "../chain/slip";
import { stampMatchesRequest, type OriginalRequestContext } from "../chain/evidence";
import { httpError } from "../http";

type Dependencies = {
  lookup: typeof lookup;
  digestOf: typeof digestOf;
  issuerAddress: typeof issuerAddress;
  recoverSigner: typeof recoverSigner;
};

export function assertRequestBlock(block: ChainReference): void {
  if (!block || block.chainId !== CHAIN_ID ||
      !Number.isSafeInteger(block.blockNumber) || block.blockNumber < 0 ||
      !Number.isSafeInteger(block.blockTimestamp) || block.blockTimestamp < 0 ||
      typeof block.blockHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(block.blockHash)) {
    throw httpError(503, "The original finalized request block could not be verified.");
  }
}

export function createWorkspaceEvaluator(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { lookup, digestOf, issuerAddress, recoverSigner, ...overrides };
  return async function evaluate(
    candidate: Slip, action: string, actionTime: number, agentId: string = AGENT_ID,
    originalContext?: OriginalRequestContext,
  ): Promise<Check[]> {
    let context: OriginalRequestContext;
    let slip: Slip;
    let issuer: string;
    try {
      context = structuredClone(originalContext!);
      slip = structuredClone(candidate);
      issuer = deps.issuerAddress().toLowerCase();
      assertRequestBlock(context.requestBlock);
      const original = context.originalSlip;
      if (!/^0x[0-9a-f]{40}$/.test(issuer) ||
          !Number.isSafeInteger(context.generation) || context.generation < 0 ||
          context.agentId !== agentId || context.action !== action ||
          context.resource !== RESOURCE || context.scenarioId !== DEFAULT_SCENARIO_ID ||
          context.requestBlock.blockTimestamp !== actionTime ||
          original.mandate.resource !== context.resource || original.mandate.scenarioId !== context.scenarioId ||
          original.mandate.issuer.toLowerCase() !== issuer ||
          deps.digestOf(original.mandate).toLowerCase() !== original.digest.toLowerCase() ||
          deps.recoverSigner(original.mandate, original.signature).toLowerCase() !== issuer || !original.anchor) {
        throw new Error("Context mismatch");
      }
    } catch {
      throw httpError(503, "The original request context could not be verified.");
    }

    const readStamp = async (target: Slip) => {
      let evidence;
      try { evidence = target.anchor ? await deps.lookup(target.anchor.txHash) : null; }
      catch { throw httpError(503, "Could not reach Monad to verify the stamp."); }
      if (!evidence || evidence.finalized !== true) {
        throw httpError(503, "The permission stamp is missing or is not finalized on Monad.");
      }
      assertRequestBlock(evidence);
      if (!target.anchor || evidence.blockNumber !== target.anchor.blockNumber ||
          evidence.blockTimestamp !== target.anchor.blockTimestamp ||
          !Number.isSafeInteger(evidence.transactionIndex) || evidence.transactionIndex < 0) {
        throw httpError(503, "The permission stamp has inconsistent Monad evidence.");
      }
      return evidence;
    };

    const original = context.originalSlip;
    const originalEvidence = await readStamp(original);
    if (!stampMatchesRequest(original, originalEvidence, context.requestBlock, issuer)) {
      throw httpError(503, "The original permission does not match its saved request evidence.");
    }

    const m = slip.mandate;
    let signer = "";
    try { signer = deps.recoverSigner(m, slip.signature); } catch { /* Failed signed check. */ }
    let stamped = false;
    let detail = "No matching stamp on Monad";
    if (slip.anchor) {
      const evidence = slip.anchor.txHash === original.anchor!.txHash
        ? originalEvidence : await readStamp(slip);
      if (stampMatchesRequest(slip, evidence, evidence, issuer)) {
        if (evidence.blockNumber === context.requestBlock.blockNumber &&
            evidence.blockHash.toLowerCase() !== context.requestBlock.blockHash.toLowerCase()) {
          throw httpError(503, "The permission and request refer to inconsistent Monad blocks.");
        }
        stamped = evidence.blockNumber <= context.requestBlock.blockNumber;
        if (!stamped) detail = "Stamped on Monad after this request";
      }
    }
    const label = actionLabel(action);
    const checks: Check[] = [
      { id: "signed", label: "Signed by the client", pass: signer.toLowerCase() === issuer && m.issuer.toLowerCase() === issuer, detail: "Not signed by " + consulting.client.name },
      { id: "agent", label: "The right AI", pass: agentId === m.agentId, detail: "This slip belongs to a different AI" },
      { id: "valid", label: "Still valid", pass: Number.isSafeInteger(actionTime) && m.issuedAt <= actionTime && actionTime < m.expiresAt, detail: "This slip has expired or is not active yet" },
      { id: "stamped", label: "Stamped before request", pass: stamped, detail },
      { id: "scope", label: label + " on the slip", pass: m.resource === RESOURCE && m.scenarioId === DEFAULT_SCENARIO_ID && ACTIONS.some(a => a.id === action) && Array.isArray(m.allowedActions) && m.allowedActions.includes(action), detail: label + " is not on this slip" },
    ];
    return checks.map(check => check.pass ? { ...check, detail: "" } : check);
  };
}

export const evaluate = createWorkspaceEvaluator();
