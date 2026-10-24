import type { Anchor, Receipt, Slip } from "@shared/contract";
import { EXPLORER_TX_URL } from "@shared/contract";
import { attemptAction, attemptAgent, attemptFingerprint, canonicalAttemptRecord } from "@shared/attempt-record";

export type EvidenceState =
  | { status: "absent" | "invalid" }
  | { status: "failed"; reason: string }
  | { status: "pending"; attemptId: string }
  | { status: "recorded"; anchor: Anchor };

const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const tx = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)
  && !/^0x0+$/i.test(value);
const linkedTransaction = (value: string | null) => {
  try { return new URL(value ?? "").pathname.match(/^\/tx\/(0x[0-9a-f]{64})\/?$/i)?.[1].toLowerCase(); }
  catch { return undefined; }
};
const safeFailureReason = (detail: string): string => {
  if (/paused|limit is approved/i.test(detail)) return "Monad recording is paused.";
  if (/limit.*reached|allowance.*exhausted/i.test(detail)) return "The approved recording allowance is exhausted.";
  if (/insufficient.*test MON/i.test(detail)) return "The signing wallet needs test MON.";
  if (/requires real Monad|practice mode/i.test(detail)) return "Recording is unavailable in practice mode.";
  if (/rejected/i.test(detail)) return "Monad did not accept the record.";
  if (/verification|could not be verified|does not verify/i.test(detail)) return "The submitted record failed verification.";
  if (/not submitted|not sent/i.test(detail)) return "The record was not submitted.";
  return "No verified record was created.";
};

/** Validate evidence independently of the access decision. Never render untrusted detail or record payloads. */
export function attemptEvidence(receipt: Receipt, slips: Slip[]): EvidenceState {
  const evidence = receipt.attemptEvidence;
  if (evidence === undefined) return { status: "absent" };
  try {
    if (!evidence || receipt.kind !== "action" || receipt.decision === "REJECTED") return { status: "invalid" };
    const record = canonicalAttemptRecord(evidence.record);
    const slip = slips.find((entry) => entry.mandate.mandateId === receipt.mandateId);
    if (!slip || record.permissionFingerprint !== slip.digest.toLowerCase()
      || typeof evidence.fingerprint !== "string" || attemptFingerprint(record) !== evidence.fingerprint.toLowerCase()
      || record.receiptId !== receipt.id || record.agent !== attemptAgent(receipt.agentId)
      || record.action !== attemptAction(receipt.action) || record.source !== receipt.source
      || record.decision !== receipt.decision || record.requestBlock.blockTimestamp !== receipt.actionTime
      || !positive(record.requestBlock.blockNumber) || !positive(record.requestBlock.blockTimestamp)
      || receipt.checks.length !== record.checks.length
      || !record.checks.every((check, i) => check.id === receipt.checks[i].id && check.pass === receipt.checks[i].pass)
      || (record.decision === "ALLOWED") !== record.checks.every((check) => check.pass)) return { status: "invalid" };
    if (evidence.status === "pending" || evidence.status === "failed") {
      if (evidence.anchor !== null || typeof evidence.detail !== "string" ||
        (evidence.txHash !== null && !tx(evidence.txHash))) return { status: "invalid" };
      return evidence.status === "pending" ? { status: "pending", attemptId: record.attemptId } :
        { status: "failed", reason: safeFailureReason(evidence.detail) };
    }
    if (evidence.status !== "recorded") return { status: "invalid" };
    const anchor = evidence.anchor;
    if (!anchor || !tx(evidence.txHash) || !tx(anchor.txHash)
      || anchor.txHash.toLowerCase() !== evidence.txHash.toLowerCase()
      || anchor.explorerUrl !== `${EXPLORER_TX_URL}${evidence.txHash}`
      || !positive(anchor.blockNumber) || !positive(anchor.blockTimestamp)
      || anchor.blockNumber <= record.requestBlock.blockNumber
      || anchor.blockTimestamp < record.requestBlock.blockTimestamp
      || anchor.explorerUrl === receipt.explorerUrl
      || linkedTransaction(receipt.explorerUrl) === anchor.txHash.toLowerCase()
      || slips.some((entry) => entry.anchor?.txHash.toLowerCase() === anchor.txHash.toLowerCase())) {
      return { status: "invalid" };
    }
    return { status: "recorded", anchor };
  } catch {
    return { status: "invalid" };
  }
}

export function evidenceCounts(slips: Slip[], receipts: Receipt[]) {
  return receipts.filter((receipt) => receipt.kind === "action" && attemptEvidence(receipt, slips).status === "recorded").length;
}
