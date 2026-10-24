import type { Anchor, Check, Mandate, Receipt, Slip } from "../../shared/contract";
import { AMENDED_MANDATE_ID, MANDATE_ID } from "../../shared/contract";
import { getScenario } from "../../shared/scenarios";
import { httpError } from "../http";
import type * as AppState from "../state";
import { withChainDeadline } from "./deadline";
import { stampMatchesRequest, type ChainReference, type LookupResult, type OriginalRequestContext } from "./evidence";
import { ChainError, remaining } from "./rpc";
import { buildMandate, digestOf, signMandate } from "./slip";
import { mondayNineNY } from "./time";
import type { AnchorOptions } from "./recording-types";

export type PermissionState = Pick<typeof AppState, "getSlip" | "addSlip" | "getReceipt" | "addReceipt" | "listReceipts"> & {
  // P3 owns these optional integration hooks. Legacy reference guards below cannot
  // detect Reset while an initially empty session's first issuance is in flight.
  getGeneration?: () => number;
  assertCurrentGeneration?: (generation: number) => void;
  getRequestContext?: (receiptId: string) => OriginalRequestContext | undefined;
};

type Dependencies = {
  state: PermissionState;
  chain: {
    anchor: (digest: string, options?: AnchorOptions) => Promise<Anchor>;
    lookup: (hash: string) => Promise<LookupResult | null>;
    latestReference: () => Promise<ChainReference>;
  };
  evaluate: (slip: Slip, action: string, time: number, agent: string, context?: OriginalRequestContext) => Promise<Check[]>;
  sign?: typeof signMandate;
  maximumMs?: number;
};

type Operation = {
  generation?: number;
  mandate?: Mandate;
  slip?: Slip;
  published?: Slip;
  publishedJson?: string;
};
type DisputeOperation = Operation & {
  blocked: Receipt;
  blockedReference: Receipt;
  blockedJson: string;
  context?: OriginalRequestContext;
  result?: Receipt;
};

/** Retains logical operations before awaiting a signature or a broadcast. One of each per session. */
export function createPermissionService({ state, chain, evaluate, sign = signMandate, maximumMs = 8000 }: Dependencies) {
  let busy = false;
  let generation = state.getGeneration?.();
  let original: (Operation & { scenarioId: string }) | undefined;
  let dispute: DisputeOperation | undefined;

  function syncSession() {
    const current = state.getGeneration?.();
    const resetObserved = original?.published && !state.getSlip(MANDATE_ID) && state.listReceipts().length === 0;
    if (current !== generation || resetObserved) {
      original = undefined;
      dispute = undefined;
    }
    generation = current;
  }

  function assertSession(op: Operation, deadline?: number) {
    if (deadline !== undefined) remaining(deadline);
    if (op.generation !== state.getGeneration?.()) throw httpError(409, "The session changed. Start with a new permission slip.");
    if (op.generation !== undefined) state.assertCurrentGeneration?.(op.generation);
  }

  function assertOriginal(deadline?: number) {
    if (!original?.published || !original.slip) throw httpError(409, "Sign the permission slip first.");
    assertSession(original, deadline);
    if (state.getSlip(MANDATE_ID) !== original.published || JSON.stringify(original.published) !== original.publishedJson) {
      throw httpError(409, "The original permission changed. Reset before starting another run.");
    }
    return original.slip; // Private signed snapshot, never the mutable state object.
  }

  function assertBlocked(op: DisputeOperation, deadline?: number) {
    assertSession(op, deadline);
    assertOriginal(deadline);
    if (state.getReceipt(op.blocked.id) !== op.blockedReference || decisionJson(op.blockedReference) !== op.blockedJson) {
      throw httpError(409, "The original request changed. Run the hidden note scene again.");
    }
  }

  // Recording status can change independently; the original authorization cannot.
  function decisionJson(receipt: Receipt) {
    const { attemptEvidence: _audit, ...decision } = receipt;
    return JSON.stringify(decision);
  }

  async function prepared(op: Operation, label: Slip["label"], deadline: number) {
    if (!op.slip) {
      const signed = await sign(structuredClone(op.mandate!));
      assertSession(op, deadline);
      op.slip = { mandate: structuredClone(op.mandate!), ...signed, label, anchor: null };
    }
    return op.slip;
  }

  async function exclusive<T>(operation: (deadline: number) => Promise<T>): Promise<T> {
    if (busy) throw httpError(409, "A permission operation is already running. Retry the same request.");
    busy = true;
    const deadline = Date.now() + maximumMs;
    try {
      syncSession();
      return await withChainDeadline(deadline, () => operation(deadline));
    } catch (error) {
      if (error instanceof ChainError) {
        const reference = error.txHash ? ` Transaction: ${error.txHash}. Retry to check the same stamp.` : "";
        throw httpError(503, `${error.message}${reference}`);
      }
      if (error instanceof Error && error.message.startsWith("ISSUER_PRIVATE_KEY")) throw httpError(503, error.message);
      throw error;
    } finally {
      busy = false;
    }
  }

  async function issue(scenarioId: unknown): Promise<Slip> {
    return exclusive(async (deadline) => {
      if (typeof scenarioId !== "string") throw httpError(400, "Choose a valid scenario.");
      const scenario = getScenario(scenarioId);
      if (!scenario || scenario.id !== scenarioId) throw httpError(400, "Unknown scenario.");
      if (original && original.scenarioId !== scenarioId) throw httpError(409, "Reset before choosing another scenario.");
      if (!original) {
        if (state.getSlip(MANDATE_ID) || state.listReceipts().length) throw httpError(409, "Reset before starting another permission.");
        original = { scenarioId, generation };
      }
      const op = original;
      assertSession(op, deadline);
      if (op.published) return structuredClone(assertOriginal(deadline));
      if (!op.mandate) {
        const ref = await chain.latestReference();
        assertSession(op, deadline);
        op.mandate = buildMandate({ scenarioId, allowedActions: [scenario.allowed.name], issuedAt: ref.blockTimestamp });
      }
      const slip = await prepared(op, "Original", deadline);
      assertSession(op, deadline);
      if (!slip.anchor) slip.anchor = await chain.anchor(slip.digest, { beforeSend: () => assertSession(op) });
      assertSession(op, deadline);
      if (state.getSlip(MANDATE_ID)) throw httpError(409, "A different permission was published. Reset before continuing.");
      op.published = state.addSlip(structuredClone(slip));
      op.publishedJson = JSON.stringify(op.published);
      return structuredClone(slip);
    });
  }

  async function replayDispute(): Promise<Receipt> {
    return exclusive(async (deadline) => {
      const source = assertOriginal(deadline);
      if (!dispute) {
        const scenario = getScenario(source.mandate.scenarioId);
        const blocked = state.listReceipts().find((r) =>
          r.kind === "action" && r.decision === "BLOCKED" && r.data === null &&
          r.mandateId === source.mandate.mandateId && r.agentId === source.mandate.agentId &&
          r.action === scenario?.forbidden.name && r.checks.length === 5 &&
          ["signed", "agent", "valid", "stamped", "scope"].every((id, i) => r.checks[i].id === id && r.checks[i].pass === (id !== "scope")) &&
          source.mandate.issuedAt <= r.actionTime && r.actionTime < source.mandate.expiresAt,
        );
        if (!blocked) throw httpError(409, "Run a blocked salary request under the original permission first.");
        const context = state.getRequestContext?.(blocked.id);
        if (state.getRequestContext && !context) throw httpError(409, "The original request evidence is missing.");
        if (context && (
          context.generation !== generation || context.agentId !== blocked.agentId || context.action !== blocked.action ||
          context.resource !== source.mandate.resource || context.scenarioId !== source.mandate.scenarioId ||
          context.requestBlock.blockTimestamp !== blocked.actionTime ||
          digestOf(context.originalSlip.mandate) !== source.digest || context.originalSlip.signature !== source.signature
        )) throw httpError(409, "The original request evidence does not match this permission.");
        dispute = {
          generation, blocked: structuredClone(blocked), blockedReference: blocked, blockedJson: decisionJson(blocked),
          context: context ? structuredClone(context) : undefined,
        };
      }
      const op = dispute;
      assertBlocked(op, deadline);
      if (op.result) {
        if (state.getReceipt(op.result.id) !== op.result) throw httpError(409, "The dispute record changed. Reset before continuing.");
        return structuredClone(op.result);
      }
      if (!op.mandate) {
        op.mandate = {
          ...buildMandate({
            scenarioId: source.mandate.scenarioId, mandateId: AMENDED_MANDATE_ID,
            allowedActions: [...source.mandate.allowedActions, op.blocked.action],
            issuedAt: mondayNineNY(op.blocked.actionTime), expiresAt: source.mandate.expiresAt,
          }),
          issuer: source.mandate.issuer, agentId: source.mandate.agentId, resource: source.mandate.resource,
        };
      }
      const amended = await prepared(op, "Amended", deadline);
      assertBlocked(op, deadline);
      if (!amended.anchor) {
        // Legacy P2 compatibility only. Once request context is retained, block ordering
        // replaces this next-second wait; equal timestamps must still be rejected by P2.
        while (true) {
          const now = await chain.latestReference();
          assertBlocked(op, deadline);
          if (op.context ? now.blockNumber > op.context.requestBlock.blockNumber : now.blockTimestamp > op.blocked.actionTime) break;
          await new Promise((resolve) => setTimeout(resolve, Math.min(200, remaining(deadline))));
        }
        amended.anchor = await chain.anchor(amended.digest, { beforeSend: () => assertBlocked(op) });
      }
      assertBlocked(op, deadline);
      // Establish real evidence independently, rather than turning P2's RPC-error
      // stamped=false into a falsely successful "late permission" demonstration.
      const evidence = await chain.lookup(amended.anchor.txHash);
      const now = await chain.latestReference();
      assertBlocked(op, deadline);
      if (!stampMatchesRequest(amended, evidence, now)) throw new ChainError("The amended permission could not be verified on Monad.", amended.anchor.txHash);
      const late = op.context
        ? evidence!.blockNumber > op.context.requestBlock.blockNumber
        : evidence!.blockTimestamp > op.blocked.actionTime;
      if (!late) throw httpError(409, "This permission was not recorded after the original request.");
      const checks = await evaluate(
        structuredClone(amended), op.blocked.action, op.blocked.actionTime, op.blocked.agentId, op.context,
      );
      assertBlocked(op, deadline);
      const expected = ["signed", "agent", "valid", "stamped", "scope"];
      if (checks.length !== 5 || !expected.every((id, i) => checks[i].id === id && checks[i].pass === (id !== "stamped")) ||
          /could not|unavailable|timed out|no matching/i.test(checks[3].detail)) {
        throw httpError(503, "The bouncer did not establish a late-permission rejection. The dispute was not recorded.");
      }
      // No await between the final guards and both writes. Never fetch protected data here.
      state.addSlip(structuredClone(amended));
      op.result = state.addReceipt({
        kind: "dispute", source: "forced", decision: "REJECTED", actionTime: op.blocked.actionTime,
        checks, data: null, agentId: op.blocked.agentId, mandateId: AMENDED_MANDATE_ID,
        action: op.blocked.action, explorerUrl: amended.anchor.explorerUrl,
      });
      return structuredClone(op.result);
    });
  }

  return { issue, replayDispute };
}
