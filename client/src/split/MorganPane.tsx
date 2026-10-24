// Right column: JT Morgan, the bank client. Before the grant: the grant panel.
// After: only the current request — what Atlas asks for, checks, one verdict.
import { COPY, itemLabel, shortLabel, shownChecks } from "../labels";
import type { Stage } from "./types";

type Props = {
  granted: boolean;
  granting: boolean;
  canGrant: boolean;
  onGrant: () => void;
  stage: Stage | null;
  error: string | null;
};

export default function MorganPane({ granted, granting, canGrant, onGrant, stage, error }: Props) {
  return (
    <section className="pane pane-client">
      <h2 className="pane-head">
        <span className="pane-name">{COPY.headers.client.name}</span>
        <span className="pane-role">{COPY.headers.client.role}</span>
      </h2>

      <div className="client-body">
        {error ? <p className="error">{error}</p>
          : !granted ? <GrantPanel granting={granting} canGrant={canGrant} onGrant={onGrant} />
          : stage ? <Current stage={stage} />
          : <p className="empty">{COPY.empty.client}</p>}
      </div>
    </section>
  );
}

function GrantPanel({ granting, canGrant, onGrant }: { granting: boolean; canGrant: boolean; onGrant: () => void }) {
  return (
    <div className="grant">
      <div className="eyebrow">{COPY.grant.title}</div>
      <ul className="toggles">
        <li className="on"><span className="radio" aria-hidden /> Regional branch profitability</li>
        <li><span className="radio" aria-hidden /> Employee compensation</li>
      </ul>
      <button className="primary" onClick={onGrant} disabled={!canGrant}>
        {granting ? COPY.grant.busy : COPY.grant.button}
      </button>
    </div>
  );
}

function Current({ stage }: { stage: Stage }) {
  const r = stage.receipt;
  const checks = r ? shownChecks(r.checks, r.action).slice(0, stage.checksShown) : [];
  const good = r?.decision === "ALLOWED";
  return (
    <div className="current">
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

      {stage.phase === "checking" && <p className="checking"><span className="spinner" aria-hidden /> {COPY.checking}</p>}

      <ul className="verdict-checks">
        {checks.map((c) => (
          <li key={c.id} className={c.pass ? "yes" : "no"}>{c.pass ? "✓" : "✕"} {c.text}</li>
        ))}
      </ul>

      {stage.phase === "done" && r && (
        <div className="verdict">
          <span className={`stamp ${good ? "good" : "bad"}`}>{r.decision}</span>
          <span className="footer-note">{COPY.footers[r.decision]}</span>
        </div>
      )}
    </div>
  );
}
