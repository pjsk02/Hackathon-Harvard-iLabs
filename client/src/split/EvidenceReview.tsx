import type { Receipt, Slip } from "@shared/contract";
import { AGENT, itemLabel, permissionName, time } from "../labels";
import AttemptEvidence from "../AttemptEvidence";
import MonadRecord from "../MonadRecord";
import { recordedAnchor } from "./evidence";

/** Disputes review a past request; they must not replace that request's access outcome. */
export function reviewContext(slips: Slip[], receipts: Receipt[]) {
  const receipt = receipts.filter((entry) => entry.kind === "action")
    .sort((a, b) => b.actionTime - a.actionTime || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  const permission = receipt
    ? slips.find((slip) => slip.mandate.mandateId === receipt.mandateId) ?? null
    : slips.find((slip) => slip.label === "Original") ?? slips[0] ?? null;
  return { receipt, permission };
}

export default function EvidenceReview({ slips, receipts, busy, onRecheck }: {
  slips: Slip[];
  receipts: Receipt[];
  busy?: boolean;
  onRecheck?: (receipt: Receipt, attemptId: string) => void;
}) {
  const { receipt, permission } = reviewContext(slips, receipts);
  const anchor = permission ? recordedAnchor(permission.anchor) : null;
  return (
    <section className="evidence-review" aria-label="Monad evidence review">
      <p className="evidence-review-intro">Two records, different moments: permission authorizes access; request evidence commits the check&apos;s result.</p>
      <article className="evidence-review-card" aria-labelledby="review-request-heading" data-review-record="request">
        <div className="review-card-head">
          <h3 id="review-request-heading">Request record</h3>
          <span className="review-record-kind">Access decision</span>
        </div>
        {receipt ? <>
          <p className="review-source">Latest request · {receipt.source === "forced" ? "Manual request · not an AI proposal" : `${AGENT} request`}</p>
          <p className="review-action">{itemLabel(receipt.action)}</p>
          <p className="review-outcome" data-decision={receipt.decision}>{receipt.decision}</p>
          <p className="review-decision-note">{receipt.decision === "ALLOWED" ? "Request allowed by Envoi."
            : receipt.decision === "BLOCKED" ? "Request blocked by Envoi." : "Request rejected by Envoi."}</p>
          <p className="review-caption">Access checked at {time(receipt.actionTime)}. Request recording happens afterward; it does not change the authorization time.</p>
          <AttemptEvidence receipt={receipt} slips={slips} busy={busy} onRecheck={onRecheck} presentation="card" />
        </> : <p className="review-empty">No request has been checked yet. Run a clean or injected example after granting permission. A permission record is not a request record.</p>}
      </article>
      <article className="evidence-review-card" aria-labelledby="review-permission-heading" data-review-record="permission">
        <div className="review-card-head">
          <h3 id="review-permission-heading">Permission record</h3>
          <span className="review-record-kind">Authorization</span>
        </div>
        {permission ? <>
          <p className="review-permission-name">{permissionName(permission)} · {permission.label}</p>
          <p className="review-caption">{receipt ? "The permission used for this request." : "The permission available for a request."}
            {" "}{anchor ? `Authorization recorded at ${time(anchor.blockTimestamp)}.` : "No confirmed permission record."}</p>
          {anchor ? <MonadRecord anchor={anchor} label={`${permissionName(permission)} permission record`} />
            : <p className="review-empty">No verified Monad link is available for this permission.</p>}
        </> : <p className="review-empty">{receipt
          ? "The permission for this request is unavailable. A different permission cannot stand in for it."
          : "Grant a permission first. Its confirmed record will appear here."}</p>}
      </article>
      <p className="evidence-boundary"><strong>What this proves.</strong> Public evidence records Envoi&apos;s commitment to the permission and request result—not independent proof of AI reasoning.</p>
    </section>
  );
}
