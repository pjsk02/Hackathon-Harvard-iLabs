// Classic one-screen view: the fallback layout. Press V or open /?view=classic.
import { useCallback, useEffect, useState } from "react";
import type { Receipt, ReportId, Slip, StateResponse } from "@shared/contract";
import { AGENT_ID, MANDATE_ID } from "@shared/contract";
import { actionLabel } from "@shared/scenarios";
import { api } from "../api";

const short = (h: string) => (h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);
const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString();

export default function ClassicApp() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [revealHidden, setRevealHidden] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportId>("clean");
  const [lastRun, setLastRun] = useState<Receipt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api.state());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const scenario = data?.scenario;
  const original = data?.slips.find((s) => s.label === "Original");
  const amended = data?.slips.find((s) => s.label === "Amended");
  const hasBlocked = !!data?.receipts.some((r) => r.decision === "BLOCKED");
  const scene = !original ? 1 : data?.receipts.some((r) => r.kind === "dispute") ? 3 : 2;

  const actions = {
    hidden: () => {
      setRevealHidden((v) => !v);
      setActiveReport("poisoned");
    },
    sign: () => run("JT Morgan is signing. Stamping on Monad…", async () => {
      await api.sign(scenario!.id);
    }),
    clean: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("clean");
      setLastRun((await api.run("clean")).receipts);
    }),
    poisoned: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("poisoned");
      setLastRun((await api.run("poisoned")).receipts);
    }),
    force: () => run("Checking the slip with Monad…", async () => {
      setActiveReport("poisoned");
      const r = await api.act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action: scenario!.forbidden.name });
      setLastRun([r]);
    }),
    dispute: () => run("Checking the slip with Monad…", async () => {
      setLastRun([await api.dispute()]);
    }),
    reset: () => run("Resetting…", async () => {
      await api.reset();
      setLastRun([]);
      setRevealHidden(false);
      setActiveReport("clean");
    }),
  };

  const buttons: { key: string; label: string; onClick: () => void; enabled: boolean; why?: string }[] = [
    { key: "1", label: "Show hidden text", onClick: actions.hidden, enabled: true },
    { key: "2", label: "Sign & stamp", onClick: actions.sign, enabled: !original, why: "Already signed" },
    { key: "3", label: "Run · clean report", onClick: actions.clean, enabled: !!original, why: "Sign the slip first" },
    { key: "4", label: "Run · hidden note", onClick: actions.poisoned, enabled: !!original, why: "Sign the slip first" },
    { key: "5", label: "Force salary request", onClick: actions.force, enabled: !!original, why: "Sign the slip first" },
    { key: "6", label: "Replay the dispute", onClick: actions.dispute, enabled: hasBlocked, why: "Block a request first" },
    { key: "0", label: "Reset", onClick: actions.reset, enabled: true },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const b = buttons.find((x) => x.key === e.key);
      if (b?.enabled) b.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!scenario) return <div className="loading">{error ?? "Loading…"}</div>;

  const report = scenario.reports[activeReport];
  const ordered = [...lastRun].sort((a, b) => Number(a.decision === "ALLOWED") - Number(b.decision === "ALLOWED"));

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img className="logo" src="/envoi-logo.png" alt="" />
          <span className="wordmark">Envoi</span>
          <span className="muted">{scenario.client.name} ↔ {scenario.firm.name}</span>
        </div>
        <ol className="steps">
          {["Slip", "AI at work", "Dispute"].map((s, i) => (
            <li key={s} className={i + 1 === scene ? "current" : i + 1 < scene ? "done" : ""}>
              {i + 1} {s} {i + 1 < scene && "✓"}
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
              <p className="muted">Press Sign &amp; stamp.</p>
            </div>
          )}
          {amended && <SlipCard slip={amended} />}
        </section>

        <section className="col">
          <h2>What Atlas is reading</h2>
          <div className="segmented">
            <button className={activeReport === "clean" ? "on" : ""} onClick={() => setActiveReport("clean")}>Clean report</button>
            <button className={activeReport === "poisoned" ? "on" : ""} onClick={() => setActiveReport("poisoned")}>Report with hidden note</button>
          </div>
          <article className="card doc">
            {report.split("\n\n").map((para, i) => {
              const m = para.match(/^\[\[HIDDEN\]\]([\s\S]*)\[\[\/HIDDEN\]\]$/);
              if (!m) return <p key={i}>{para}</p>;
              return revealHidden ? (
                <div key={i} className="hidden-note revealed">
                  <div className="mono small">HIDDEN NOTE · invisible to people, read by the AI</div>
                  <p>{m[1]}</p>
                </div>
              ) : <p key={i} className="hidden-note">{m[1]}</p>;
            })}
          </article>
        </section>

        <section className="col">
          <h2>The bouncer</h2>
          {busy ? <p className="muted pulse">{busy}</p>
            : error ? <p className="bad">{error}</p>
            : ordered.length === 0 ? <p className="muted">The bouncer checks every request against the slip before any data moves.</p>
            : ordered.slice(0, 2).map((r) => <DecisionCard key={r.id} r={r} />)}
        </section>
      </main>

      <section className="record">
        <h2>Public record</h2>
        {data!.receipts.length === 0 && data!.slips.length === 0
          ? <p className="muted">No permissions yet.</p>
          : (
            <ul className="mono small events">
              {data!.slips.map((s) => s.anchor && <li key={s.anchor.txHash}>● {time(s.anchor.blockTimestamp)} {s.label === "Original" ? "Slip stamped" : "Monday slip stamped"}</li>)}
              {[...data!.receipts].reverse().map((r) => <li key={r.id} className={r.decision === "ALLOWED" ? "good" : "bad"}>● {time(r.actionTime)} {r.decision}</li>)}
            </ul>
          )}
      </section>

      <footer className="controls">
        {buttons.map((b) => (
          <button key={b.key} className="ghost" disabled={!!busy || !b.enabled} title={!b.enabled ? b.why : undefined} onClick={b.onClick}>
            <kbd>{b.key}</kbd> {b.label}
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
      <div className="row"><strong>{amended ? "SLIP MERIDIAN SHOWED AFTERWARDS" : "PERMISSION SLIP"}</strong><span className="muted">{slip.label}</span></div>
      <p>Can see: {slip.mandate.allowedActions.map((a) => actionLabel(a)).join(", ")}</p>
      <p className="good">✓ Signed by JT Morgan</p>
      {slip.anchor && (
        <>
          <p className="mono small">✓ Stamped on Monad · {time(slip.anchor.blockTimestamp)} · block {slip.anchor.blockNumber.toLocaleString()} · {short(slip.anchor.txHash)}</p>
          <a href={slip.anchor.explorerUrl} target="_blank" rel="noreferrer">View on public record ↗</a>
        </>
      )}
    </div>
  );
}

function DecisionCard({ r }: { r: Receipt }) {
  const good = r.decision === "ALLOWED";
  return (
    <div className="card decision">
      <p><strong>Atlas asked for {actionLabel(r.action)}</strong>{r.source === "forced" && <span className="tag">forced</span>}</p>
      <ul className="checks">
        {r.checks.map((c) => (
          <li key={c.id} className={c.pass ? "good" : "bad"}>
            {c.pass ? "✓" : "✕"} {c.label}
            {!c.pass && <div className="detail">{c.detail}</div>}
          </li>
        ))}
      </ul>
      <div className={`stamp ${good ? "good" : "bad"}`}>{r.decision}</div>
      <p className="muted">
        {good ? "Sent to Atlas." : r.kind === "dispute" ? "Doesn't count." : "Nothing sent."}
      </p>
    </div>
  );
}
