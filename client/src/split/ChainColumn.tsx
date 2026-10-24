// Permission anchors are Monad evidence. Request receipts are application records only.
import type { Receipt, Slip } from "@shared/contract";
import { consulting } from "@shared/scenarios";
import { AGENT, CLIENT, COPY, FIRM, permissionName, shortLabel, time, weekday } from "../labels";
import { recordedAnchor, receiptShowsLatePermission } from "./evidence";
import "./evidence.css";

type Props = {
  slips: Slip[];
  blocked: Receipt | null;
  pulse: Slip["label"] | null;
  /** Only receipts already revealed by the parent choreography. */
  receipts?: Receipt[];
  review?: boolean;
};
type Item =
  | { kind: "slip"; at: number; rank: number; slip: Slip }
  | { kind: "marker"; at: number; rank: number; receipt: Receipt };

export default function ChainColumn({ slips, blocked, pulse, receipts = [], review = false }: Props) {
  const attempts = [...new Map([...receipts, ...(blocked ? [blocked] : [])].map((r) => [r.id, r])).values()];
  const items: Item[] = [
    ...slips.map((slip): Item => ({
      kind: "slip", at: slip.anchor?.blockTimestamp ?? Infinity,
      rank: slip.label === "Original" ? 0 : 2, slip,
    })),
    ...attempts.map((receipt): Item => ({ kind: "marker", at: receipt.actionTime, rank: 1, receipt })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank);
  const amended = slips.some((slip) => slip.label === "Amended");
  const recorded = slips.filter((slip) => recordedAnchor(slip.anchor)).length;

  return (
    <section className="pane pane-chain" id="monad-evidence" tabIndex={-1} aria-labelledby="monad-evidence-heading">
      <h2 className="pane-head" id="monad-evidence-heading">
        <span className="pane-name">{COPY.headers.chain.name}</span>
        <span className="pane-role">{COPY.headers.chain.role}</span>
      </h2>
      <p className="chain-sub">{COPY.chainSubtitle}</p>
      {review && (
        <p className="evidence-summary" role="status">
          <span>{recorded ? "Permission public-record links supplied by the server" : "No usable permission public-record link supplied"}</span>
          <span>Attempts are application records, not recorded on Monad.</span>
          {recorded > 0 && recorded < slips.length && <span>Some permissions have no usable public-record link.</span>}
        </p>
      )}
      <div className="chain">
        {items.length === 0 && <p className="empty">{COPY.empty.chain}</p>}
        {items.map((item) => item.kind === "marker" ? (
          <div key={`attempt-${item.receipt.id}`} className="marker attempt-marker">
            <strong>
              {item.receipt.kind === "dispute" ? "Permission review" : item.receipt.source === "forced" ? "Forced request" : "Atlas request"}
              {" · "}{shortLabel(item.receipt.action)} · {item.receipt.decision}
            </strong>
            <span>Application record · {time(item.receipt.actionTime)}</span>
            <span className="attempt-unrecorded">Not recorded on Monad</span>
          </div>
        ) : (
          <Block key={item.slip.mandate.mandateId} slip={item.slip}
            pulsing={pulse === item.slip.label}
            superseded={amended && item.slip.label === "Original"}
            lateReceipt={attempts.find((receipt) => receipt.mandateId === item.slip.mandate.mandateId && receiptShowsLatePermission(receipt))} />
        ))}
      </div>
    </section>
  );
}

function Block({ slip, pulsing, superseded, lateReceipt }: {
  slip: Slip; pulsing: boolean; superseded: boolean; lateReceipt?: Receipt;
}) {
  const anchor = recordedAnchor(slip.anchor);
  const late = slip.label === "Amended" && !!anchor && !!lateReceipt;
  const signaturePresent = /^0x[0-9a-f]{130}$/i.test(slip.signature) && !/^0x0+$/i.test(slip.signature);
  const agent = slip.mandate.agentId === consulting.agent.id ? `${AGENT} · ${FIRM}` : "Different agent";
  const expiry = new Date(slip.mandate.expiresAt * 1000);

  return (
    <div className={`block ${pulsing ? "pulsing" : ""} ${late ? "late" : ""} ${superseded ? "superseded" : ""}`}>
      <div className="block-top">
        <span className="block-name">{permissionName(slip)}</span>
        {anchor ? (
          <a href={anchor.explorerUrl} target="_blank" rel="noreferrer"
            aria-label={`View ${permissionName(slip)} on Monad, block ${anchor.blockNumber}`}>
            block {anchor.blockNumber.toLocaleString()} ↗
          </a>
        ) : <span className="dim">Not recorded on Monad</span>}
      </div>
      <dl className="permission-facts">
        <dt>For</dt><dd>{agent}</dd>
        <dt>Valid until</dt><dd>{Number.isFinite(expiry.getTime()) ? expiry.toLocaleString() : "Expiry unavailable"}</dd>
        <dt>Signature</dt><dd>{signaturePresent ? "Present · checked per request" : "Missing or invalid"}</dd>
      </dl>
      <div className="block-label">{COPY.mayRead}</div>
      <ul className="block-items">
        {[consulting.allowed, consulting.forbidden].map((action) => {
          const allowed = slip.mandate.allowedActions.includes(action.name);
          return (
            <li key={action.name} className={allowed ? "yes" : "no"}>
              <span aria-hidden="true">{allowed ? "✓" : "✕"} </span>
              {allowed ? "Can see: " : "Cannot see: "}{action.label}
            </li>
          );
        })}
      </ul>
      <div className="block-meta">
        {slip.label === "Amended" ? `Dated ${weekday(slip.mandate.issuedAt)}` : `Issued for ${CLIENT}`}
        {anchor && ` · Server-reported record time ${time(anchor.blockTimestamp)}`}
      </div>
      {late && <span className="late-tag">{COPY.addedAfter}</span>}
    </div>
  );
}
