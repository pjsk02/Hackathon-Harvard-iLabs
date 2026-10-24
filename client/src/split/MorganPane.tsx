// Right column: JT Morgan, the bank client. Before the grant: the grant panel.
// After: only the current request — what Atlas asks for, checks, one verdict.
import { useRef } from "react";
import type { Receipt } from "@shared/contract";
import { COPY, itemLabel, shortLabel } from "../labels";
import { evidenceChecks, profitabilityRows } from "./evidence";
import type { Stage } from "./types";
import "./evidence.css";

type Props = {
  granted: boolean;
  granting: boolean;
  canGrant: boolean;
  onGrant: () => void;
  stage: Stage | null;
  error: string | null;
  allowedReceipt?: Receipt | null;
};

export default function MorganPane({ granted, granting, canGrant, onGrant, stage, error, allowedReceipt }: Props) {
  const previous = useRef<Stage | null>(null);
  if (!granted) previous.current = null;
  if (stage?.phase === "done" && stage.receipt) previous.current = stage;
  const visibleStage = error && stage?.phase !== "done" ? previous.current ?? stage : stage;
  const returned = visibleStage?.phase === "done" && visibleStage.receipt?.decision === "ALLOWED"
    ? visibleStage.receipt : allowedReceipt;
  return (
    <section className="pane pane-client">
      <h2 className="pane-head">
        <span className="pane-name">{COPY.headers.client.name}</span>
        <span className="pane-role">{COPY.headers.client.role}</span>
      </h2>

      <div className="client-body">
        {error && <p className="error" role="alert">{error}</p>}
        {!granted ? <GrantPanel granting={granting} canGrant={canGrant} onGrant={onGrant} />
          : visibleStage ? <Current stage={visibleStage} />
          : <p className="empty">{COPY.empty.client}</p>}
        {granted && returned?.decision === "ALLOWED" && <AllowedTable receipt={returned} />}
      </div>
    </section>
  );
}

function GrantPanel({ granting, canGrant, onGrant }: { granting: boolean; canGrant: boolean; onGrant: () => void }) {
  return (
    <div className="grant" aria-busy={granting}>
      <div className="eyebrow">{COPY.grant.title}</div>
      <ul className="toggles">
        <li className="on"><span className="radio" aria-hidden /> Regional branch profitability</li>
        <li><span className="radio" aria-hidden /> Employee compensation</li>
      </ul>
      <button className="primary" onClick={onGrant} disabled={!canGrant || granting}>
        {granting ? COPY.grant.busy : COPY.grant.button}
      </button>
      {granting && <span role="status">{COPY.grant.busy}</span>}
    </div>
  );
}

function Current({ stage }: { stage: Stage }) {
  const r = stage.receipt;
  const allChecks = r ? evidenceChecks(r.checks, r.action) : [];
  const checks = stage.phase === "done" ? allChecks : allChecks.slice(0, stage.checksShown);
  const good = r?.decision === "ALLOWED";
  return (
    <div className="current" aria-busy={stage.phase !== "done"}>
      {stage.earlier && (
        <div className="earlier">
          {shortLabel(stage.earlier.action)} · {stage.earlier.decision.toLowerCase()}
        </div>
      )}
      <div className="eyebrow">
        {COPY.asksFor}
        {r?.source === "forced" && r.kind !== "dispute" && <span className="tag">{COPY.forced}</span>}
      </div>
      <div className="asked">{itemLabel(stage.action)}</div>

      {stage.phase === "checking" && <p className="checking" role="status"><span className="checking-skeleton" aria-hidden="true" /> {COPY.checking}</p>}

      <ul className="verdict-checks" aria-label="Permission checks" aria-live="polite" aria-relevant="additions text">
        {checks.map((c) => (
          <li key={c.id} className={c.pass ? "yes" : "no"}>
            <span aria-hidden="true">{c.pass ? "✓" : "✕"} </span>
            <span className="sr-only">{c.pass ? "Passed: " : "Failed: "}</span>
            <span className="check-detail">{c.text}</span>
          </li>
        ))}
      </ul>

      {stage.phase === "done" && r && (
        <div className="verdict" role="status">
          <span className={`stamp ${good ? "good" : "bad"}`}>{r.decision}</span>
          <span className="footer-note">{COPY.footers[r.decision]}</span>
        </div>
      )}
    </div>
  );
}

function AllowedTable({ receipt }: { receipt: Receipt }) {
  const rows = profitabilityRows(receipt);
  const lowest = new Set([...rows].sort((a, b) => a.margin - b.margin).slice(0, 2).map((row) => row.index));
  return (
    <section className="allowed-evidence" aria-label="Allowed profitability result">
      <h3>Allowed · Sent to Atlas</h3>
      {rows.length ? (
        <table>
          <caption>Returned profitability · lowest two in bold</caption>
          <thead><tr><th scope="col">Region</th><th scope="col">Margin %</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.index} className={lowest.has(row.index) ? "weakest" : undefined}>
              <th scope="row">{lowest.has(row.index) ? <strong>{row.region}</strong> : row.region}</th>
              <td>{row.margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="empty">No regional profitability rows returned.</p>}
    </section>
  );
}
