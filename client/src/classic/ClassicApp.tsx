// Classic one-screen view: the fallback layout. Press V or open /?view=classic.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Receipt, ReportId, Slip, StateResponse } from "@shared/contract";
import { AGENT_ID, MANDATE_ID } from "@shared/contract";
import { actionLabel } from "@shared/scenarios";
import { api } from "../api";
import { COPY } from "../labels";
import { recordedAnchor } from "../split/evidence";
import AttemptEvidence from "../AttemptEvidence";
import { evidenceCounts } from "../attempt-evidence";
import RequestFeedback, { type ConnectionStatus } from "../RequestFeedback";
import { canRecord, healthStatus } from "../health-status";

const short = (h: string) => (h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);
const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString();

export default function ClassicApp() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [revealHidden, setRevealHidden] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportId>("clean");
  const [lastRun, setLastRun] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [examples, setExamples] = useState({ clean: false, poisoned: false });
  const [resetArmed, setResetArmed] = useState(false);
  const operation = useRef(false);
  const pending = useSyncExternalStore(api.subscribeToPending, api.pendingAction, api.pendingAction);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: "checking", message: "Reading server status…" });
  const [checking, setChecking] = useState(false);
  const locked = !!busy || checking || pending?.phase === "waiting";

  const refresh = useCallback(async () => {
    try {
      setData(await api.state());
    } catch (e) {
      setError((previous) => previous ?? (e as Error).message);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setChecking(true);
    setError(null);
    const [state, health] = await Promise.allSettled([api.state(), api.health()]);
    if (state.status === "fulfilled") setData(state.value);
    else setError((state.reason as Error).message);
    setConnection(healthStatus(health.status === "fulfilled" ? health.value : null, { stateReadable: state.status === "fulfilled" }));
    if (health.status === "rejected") setError((previous) => previous ?? (health.reason as Error).message);
    setChecking(false);
    operation.current = false;
  }, []);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  async function run(label: string, fn: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(null);
      operation.current = false;
    }
  }

  function recheckAttempt(receipt: Receipt, attemptId: string) {
    if (operation.current || api.pendingAction()?.phase === "waiting") return;
    void run("Reading attempt record…", async () => {
      const updated = await api.reconcile(attemptId, receipt.id);
      setData((current) => current && { ...current, receipts: current.receipts.map((r) => r.id === updated.id ? updated : r) });
      setLastRun((current) => current.map((r) => r.id === updated.id ? updated : r));
    });
  }

  const scenario = data?.scenario;
  const original = data?.slips.find((s) => s.label === "Original");
  const amended = data?.slips.find((s) => s.label === "Amended");
  const hasBlocked = !!data?.receipts.some((r) => r.decision === "BLOCKED");
  const complete = [!!original, examples.clean, examples.poisoned, false];

  const actions = {
    hidden: () => {
      setRevealHidden((v) => !v);
      setActiveReport("poisoned");
    },
    sign: () => run("JT Morgan is signing. Stamping on Monad…", async () => {
      setActiveStep(1);
      await api.sign(scenario!.id);
      setActiveStep(2);
    }),
    clean: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("clean");
      setActiveStep(2);
      setLastRun((await api.run("clean")).receipts);
      setExamples((previous) => ({ ...previous, clean: true }));
    }),
    poisoned: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("poisoned");
      setActiveStep(3);
      setLastRun((await api.run("poisoned")).receipts);
      setExamples((previous) => ({ ...previous, poisoned: true }));
    }),
    evidence: () => {
      setActiveStep(4);
      document.getElementById("classic-record")?.focus({ preventScroll: true });
    },
    force: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("poisoned");
      const r = await api.act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action: scenario!.forbidden.name });
      setLastRun([r]);
    }),
    dispute: () => run("Checking the slip with Monad…", async () => {
      setLastRun([await api.dispute()]);
    }),
    reset: () => {
      if (!resetArmed) {
        setResetArmed(true);
        setTimeout(() => setResetArmed(false), 2500);
        return;
      }
      setResetArmed(false);
      return run("Resetting…", async () => {
        await api.reset();
        setLastRun([]);
        setRevealHidden(false);
        setActiveReport("clean");
        setExamples({ clean: false, poisoned: false });
        setActiveStep(1);
      });
    },
  };

  const buttons: { key: string; label: string; onClick: () => void; enabled: boolean; why?: string }[] = [
    { key: "1", label: "Grant", onClick: actions.sign, enabled: !original, why: "Already granted" },
    { key: "2", label: "Clean example", onClick: actions.clean, enabled: !!original, why: "Grant first" },
    { key: "3", label: "Injected example", onClick: actions.poisoned, enabled: !!original && examples.clean, why: "Run the clean example first" },
    { key: "4", label: "Monad evidence", onClick: actions.evidence, enabled: !!original, why: "Grant first" },
    { key: "r", label: revealHidden ? "Hide hidden text" : "Show hidden text", onClick: actions.hidden, enabled: true },
    { key: "5", label: "Force salary request", onClick: actions.force, enabled: !!original, why: "Sign the slip first" },
    { key: "6", label: "Replay the dispute", onClick: actions.dispute, enabled: hasBlocked && !amended, why: amended ? "Already disputed" : "Block a request first" },
    { key: "0", label: resetArmed ? "Press 0 again" : "Reset", onClick: actions.reset, enabled: true },
  ].map((button) => ["1", "2", "3", "5", "6"].includes(button.key) && (pending || !canRecord(connection))
    ? { ...button, enabled: false, why: "Check server and action status first" } : button);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const b = buttons.find((x) => x.key === e.key.toLowerCase());
      if (b?.enabled) { e.preventDefault(); b.onClick(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!scenario) return <main className="preflight"><h1>Envoi</h1>
    <RequestFeedback connection={connection} pending={pending} error={error} onRecheck={() => { void checkStatus(); }} rechecking={checking} busy={!!busy} />
  </main>;

  const report = scenario.reports[activeReport];
  const ordered = [...lastRun].sort((a, b) => Number(a.decision === "ALLOWED") - Number(b.decision === "ALLOWED"));

  return (
    <div className="app" data-demo-busy={locked}>
      <header className="header">
        <div className="brand">
          <img className="logo" src="/envoi-logo.png" alt="" />
          <span className="wordmark">Envoi</span>
          <span className="muted">{scenario.client.name} ↔ {scenario.firm.name}</span>
        </div>
        <ol className="steps">
          {COPY.steps.map((s, i) => (
            <li key={s} className={i + 1 === activeStep ? "current" : complete[i] ? "done" : ""} aria-current={i + 1 === activeStep ? "step" : undefined}>
              {i + 1} {s} {complete[i] && "✓"}
            </li>
          ))}
        </ol>
        <span className="mono">{data!.counter} requests checked</span>
      </header>

      <main className="columns">
        <section className="col">
          <h2>Permission slip</h2>
          {original ? <SlipCard slip={original} /> : (
            <div className="card dashed">
              <p>JT Morgan hasn&apos;t granted Atlas access yet.</p>
              <p className="muted">Press 1 · Grant.</p>
            </div>
          )}
          {amended && <SlipCard slip={amended} />}
        </section>

        <section className="col">
          <h2>What Atlas is reading</h2>
          <div className="segmented">
            <button disabled={!!busy} className={activeReport === "clean" ? "on" : ""} onClick={() => setActiveReport("clean")}>Clean report</button>
            <button disabled={!!busy} className={activeReport === "poisoned" ? "on" : ""} onClick={() => setActiveReport("poisoned")}>Report with hidden note</button>
          </div>
          <article className="card doc">
            {report.split("\n\n").map((para, i) => {
              const m = para.match(/^\[\[HIDDEN\]\]([\s\S]*)\[\[\/HIDDEN\]\]$/);
              if (!m) return <p key={i}>{para}</p>;
              return revealHidden ? (
                <div key={i} className="hidden-note revealed">
                  <div className="mono small">HIDDEN TEXT · included in the report</div>
                  <p>{m[1]}</p>
                </div>
              ) : <p key={i} className="hidden-note">{m[1]}</p>;
            })}
          </article>
        </section>

        <section className="col">
          <h2>The bouncer</h2>
          <RequestFeedback connection={connection} pending={pending} error={error} onRecheck={() => { void checkStatus(); }} rechecking={checking} busy={!!busy} />
          {busy ? <p className="muted pulse">{busy}</p>
            : ordered.length === 0 ? <p className="muted">The bouncer checks every request against the slip before any data moves.</p>
            : ordered.slice(0, 2).map((r) => <DecisionCard key={r.id} r={r} slips={data!.slips} busy={locked} onRecheck={recheckAttempt} />)}
        </section>
      </main>

       <section className="record" id="classic-record" tabIndex={-1}>
        <h2>Public record</h2>
        <p className="muted">{data!.slips.filter((s) => recordedAnchor(s.anchor)).length} permission records · {evidenceCounts(data!.slips, data!.receipts)} attempt records confirmed on Monad.</p>
        {data!.receipts.length === 0 && data!.slips.length === 0
          ? <p className="muted">No permissions yet.</p>
          : (
            <ul className="mono small events">
              {data!.slips.map((s) => recordedAnchor(s.anchor) && s.anchor && <li key={s.anchor.txHash}><a href={s.anchor.explorerUrl} target="_blank" rel="noreferrer">● {time(s.anchor.blockTimestamp)} {s.label === "Original" ? "Slip recorded" : "Amended slip recorded"} ↗</a></li>)}
              {[...data!.receipts].reverse().map((r) => <li key={r.id} className={r.decision === "ALLOWED" ? "good" : "bad"}>● {time(r.actionTime)} {r.decision} · application record · <AttemptEvidence receipt={r} slips={data!.slips} busy={locked} onRecheck={recheckAttempt} /></li>)}
            </ul>
          )}
      </section>

      <footer className="controls">
        {buttons.map((b) => (
          <button key={b.key} className="ghost" disabled={locked || !b.enabled} title={!b.enabled ? b.why : undefined} onClick={b.onClick}>
            <kbd>{b.key.toUpperCase()}</kbd> {b.label}
          </button>
        ))}
      </footer>
    </div>
  );
}

function SlipCard({ slip }: { slip: Slip }) {
  const amended = slip.label === "Amended";
  return (
    <div className={`card slip ${amended ? "amended" : ""}`}>
      <div className="row"><strong>{amended ? "AMENDED PERMISSION SLIP" : "PERMISSION SLIP"}</strong><span className="muted">{slip.label}</span></div>
      <p>Can see: {slip.mandate.allowedActions.map((a) => actionLabel(a)).join(", ")}</p>
      <p className="muted">Signature checked with every request.</p>
      {recordedAnchor(slip.anchor) && slip.anchor && (
        <>
          <p className="mono small">✓ Stamped on Monad · {time(slip.anchor.blockTimestamp)} · block {slip.anchor.blockNumber.toLocaleString()} · {short(slip.anchor.txHash)}</p>
          <a href={slip.anchor.explorerUrl} target="_blank" rel="noreferrer">View on public record ↗</a>
        </>
      )}
    </div>
  );
}

function DecisionCard({ r, slips, busy, onRecheck }: {
  r: Receipt; slips: Slip[]; busy: boolean; onRecheck: (receipt: Receipt, attemptId: string) => void;
}) {
  const good = r.decision === "ALLOWED";
  return (
    <div className="card decision">
      <p><strong>{r.source === "forced" ? "Manual request for" : "Atlas asked for"} {actionLabel(r.action)}</strong></p>
      <ul className="checks">
        {r.checks.map((c) => (
          <li key={c.id} className={c.pass ? "good" : "bad"}>
            {c.pass ? "✓" : "✕"} {c.label}
            {!c.pass && <div className="detail">{c.detail}</div>}
          </li>
        ))}
      </ul>
      <div className={`stamp ${good ? "good" : "bad"}`}>{r.decision}</div>
      <AttemptEvidence receipt={r} slips={slips} busy={busy} onRecheck={onRecheck} />
      <p className="muted">
        {good ? "Sent to Atlas." : r.kind === "dispute" ? "Doesn't count." : "Nothing sent."}
      </p>
    </div>
  );
}
