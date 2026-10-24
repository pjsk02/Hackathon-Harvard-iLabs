import { isHexString } from "ethers";
import type { AttemptEvidence, AttemptRecord, Receipt } from "../../shared/contract";
import { CHAIN_ID, EXPLORER_TX_URL } from "../../shared/contract";
import { attemptAction, attemptAgent, attemptFingerprint, canonicalAttemptRecord } from "../../shared/attempt-record";
import { httpError } from "../http";
import type * as AppState from "../state";
import type { LookupResult, OriginalRequestContext } from "./evidence";
import type { RecordingResult } from "./recording-types";

type AttemptState = Pick<typeof AppState, "assertCurrentGeneration" | "getReceipt" | "updateAttemptEvidence">;
type Dependencies = {
  state: AttemptState;
  chain: {
    recordFingerprint: (fingerprint: string, fence: () => void) => Promise<RecordingResult>;
    reconcileFingerprint: (fingerprint: string, hash: string) => Promise<RecordingResult>;
    lookup: (hash: string) => Promise<LookupResult | null>;
    issuerAddressOrNull: () => string | null;
  };
};
type Operation = { generation: number; record: AttemptRecord; fingerprint: string; inFlight: boolean };

export function makeAttemptRecord(receipt: Receipt, context: OriginalRequestContext, attemptId: string): AttemptRecord {
  return canonicalAttemptRecord({
    version: 1, attemptId, receiptId: receipt.id, chainId: CHAIN_ID,
    permissionFingerprint: context.originalSlip.digest,
    requestBlock: {
      blockNumber: context.requestBlock.blockNumber, blockHash: context.requestBlock.blockHash,
      blockTimestamp: context.requestBlock.blockTimestamp,
    },
    agent: attemptAgent(receipt.agentId), action: attemptAction(receipt.action),
    source: receipt.source, decision: receipt.decision,
    checks: receipt.checks.map(({ id, pass }) => ({ id, pass })),
  });
}

export function createAttemptService({ state, chain }: Dependencies) {
  // Retain old IDs as tombstones across Reset. Never replay lost operations on boot.
  const operations = new Map<string, Operation>();
  function current(op: Operation): Receipt {
    state.assertCurrentGeneration(op.generation);
    const receipt = state.getReceipt(op.record.receiptId);
    if (!receipt || receipt.attemptEvidence?.record.attemptId !== op.record.attemptId) {
      throw httpError(409, "This attempt no longer belongs to the current session.");
    }
    return receipt;
  }
  async function apply(op: Operation, outcome: RecordingResult): Promise<Receipt> {
    current(op);
    if (outcome.status === "recorded") {
      try {
        const evidence = await chain.lookup(outcome.txHash);
        current(op);
        const issuer = chain.issuerAddressOrNull()?.toLowerCase();
        const a = outcome.anchor;
        const valid = isHexString(outcome.txHash, 32) && a.txHash === outcome.txHash &&
          a.explorerUrl === `${EXPLORER_TX_URL}${outcome.txHash}` &&
          !!evidence && !!issuer && evidence.finalized === true && evidence.chainId === CHAIN_ID &&
          evidence.status === 1 && evidence.from.toLowerCase() === issuer && evidence.to.toLowerCase() === issuer &&
          BigInt(evidence.value) === 0n && evidence.data.toLowerCase() === op.fingerprint &&
          isHexString(evidence.blockHash, 32) && evidence.blockNumber === a.blockNumber &&
          evidence.blockTimestamp === a.blockTimestamp && a.blockNumber > op.record.requestBlock.blockNumber &&
          a.blockTimestamp >= op.record.requestBlock.blockTimestamp;
        if (!valid) outcome = { status: "failed", anchor: null, txHash: outcome.txHash, detail: "The record could not be verified. No replacement was sent." };
      } catch {
        current(op);
        outcome = { status: "pending", anchor: null, txHash: outcome.txHash, detail: "Readback is unavailable. Recheck without sending another transaction." };
      }
    }
    current(op);
    const evidence: AttemptEvidence = { record: op.record, fingerprint: op.fingerprint, ...outcome };
    return structuredClone(state.updateAttemptEvidence(op.record.receiptId, evidence, op.generation));
  }

  async function record(receipt: Receipt, context: OriginalRequestContext, attemptId: string): Promise<Receipt> {
    state.assertCurrentGeneration(context.generation);
    const previous = operations.get(attemptId);
    if (previous) return structuredClone(current(previous));
    const safeRecord = makeAttemptRecord(receipt, context, attemptId);
    const op: Operation = {
      generation: context.generation, record: safeRecord, fingerprint: attemptFingerprint(safeRecord), inFlight: true,
    };
    operations.set(attemptId, op);
    state.updateAttemptEvidence(receipt.id, {
      record: safeRecord, fingerprint: op.fingerprint, status: "pending", anchor: null,
      txHash: null, detail: "Waiting for a bounded Monad recording result.",
    }, op.generation);
    try {
      const result = await chain.recordFingerprint(op.fingerprint, () => { current(op); });
      return await apply(op, result);
    } catch {
      current(op);
      return await apply(op, {
        status: "pending", anchor: null, txHash: current(op).attemptEvidence?.txHash ?? null,
        detail: "The recording result is unknown. The authorization decision is unchanged.",
      });
    } finally {
      op.inFlight = false;
    }
  }

  async function reconcile(attemptId: string): Promise<Receipt> {
    const op = operations.get(attemptId);
    if (!op) throw httpError(404, "This attempt is unknown. No transaction was sent.");
    const receipt = current(op);
    const evidence = receipt.attemptEvidence!;
    if (op.inFlight || evidence.status !== "pending" || !evidence.txHash) return structuredClone(receipt);
    op.inFlight = true;
    try {
      let result: RecordingResult;
      try { result = await chain.reconcileFingerprint(op.fingerprint, evidence.txHash); }
      catch {
        current(op);
        result = { status: "pending", anchor: null, txHash: evidence.txHash, detail: "Readback is unavailable. No transaction was sent." };
      }
      return await apply(op, result);
    } finally { op.inFlight = false; }
  }

  return { record, reconcile };
}
