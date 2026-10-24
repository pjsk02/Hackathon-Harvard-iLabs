import type { Receipt, Slip } from "@shared/contract";
import { attemptEvidence } from "./attempt-evidence";
import MonadRecord from "./MonadRecord";

export default function AttemptEvidence({ receipt, slips, busy = false, onRecheck, presentation = "inline" }: {
  receipt: Receipt;
  slips: Slip[];
  busy?: boolean;
  onRecheck?: (receipt: Receipt, attemptId: string) => void;
  presentation?: "inline" | "card";
}) {
  const evidence = attemptEvidence(receipt, slips);
  if (presentation === "card" && evidence.status === "recorded") {
    return <div data-attempt-evidence="recorded"><MonadRecord anchor={evidence.anchor} label={`request record for ${receipt.id}`} /></div>;
  }
  return (
    <span className={presentation === "card" ? "review-attempt-status" : "attempt-unrecorded"} data-attempt-evidence={evidence.status}>
      {evidence.status === "absent" && "Not recorded on Monad"}
      {evidence.status === "invalid" && "Record could not be verified"}
      {evidence.status === "failed" && <>Attempt recording failed. {evidence.reason} The access decision is unchanged.</>}
      {evidence.status === "pending" && <>
        Attempt recording pending.{" "}
        {onRecheck && <button type="button" className="ghost" disabled={busy}
          aria-label={`Recheck attempt record for ${receipt.id}`}
          onClick={() => onRecheck(receipt, evidence.attemptId)}>Recheck record</button>}
      </>}
      {evidence.status === "recorded" && <a href={evidence.anchor.explorerUrl} target="_blank" rel="noopener noreferrer"
        aria-label={`View attempt record for ${receipt.id} on Monad, block ${evidence.anchor.blockNumber}`}>
        Attempt recorded on Monad · block {evidence.anchor.blockNumber.toLocaleString()} ↗
      </a>}
    </span>
  );
}
