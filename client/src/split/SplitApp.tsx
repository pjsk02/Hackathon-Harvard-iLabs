// Three-column stage: Baine (left) · Monad (middle) · JT Morgan (right).
// Holds state and the choreography. Every outcome comes from an API response;
// this file only reveals real results at human speed.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Receipt, ReportId, Slip, StateResponse } from "@shared/contract";
import { AGENT_ID, MANDATE_ID } from "@shared/contract";
import { consulting } from "@shared/scenarios";
import { api, isMock } from "../api";
import { COPY, answerFrom, shownChecks, weekday } from "../labels";
import BainePane from "./BainePane";
import ChainColumn from "./ChainColumn";
import MorganPane from "./MorganPane";
import type { FeedItem, Preview, Stage } from "./types";
import "./split.css";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => (reducedMotion() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
let seq = 0;
const nextId = () => `f${++seq}`;

export default function SplitApp() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [pulse, setPulse] = useState<Slip["label"] | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview>("closed");
  const [attached, setAttached] = useState<ReportId>("clean");
  const [busy, setBusy] = useState(false);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const token = useRef(0); // bumps on reset so a running choreography stops

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setData(s);
      return s;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().then((s) => s && setRevealed(new Set(s.receipts.map((r) => r.id))));
  }, [refresh]);

  const push = (item: FeedItem) => setFeed((f) => [...f, item]);
  const patch = (id: string, change: Partial<FeedItem>) =>
    setFeed((f) => f.map((x) => (x.id === id ? ({ ...x, ...change } as FeedItem) : x)));

  /** Wrap a beat: lock the controls, catch the one-sentence error. */
  async function beat(fn: (alive: () => boolean) => Promise<void>) {
    const mine = token.current;
    const alive = () => token.current === mine;
    setBusy(true);
    setError(null);
    try {
      await fn(alive);
    } catch (e) {
      if (alive()) {
        setError((e as Error).message);
        setStage(null);
        setPulse(null);
        setFeed((f) => f.map((x) => (x.kind === "status" && !x.done ? { ...x, done: true } : x)));
      }
    } finally {
      if (alive()) {
        setBusy(false);
        await refresh();
      }
    }
  }

  /** Reveal one real receipt: bubble → Monad pulse → checks → stamp → reply. */
  async function reveal(r: Receipt, alive: () => boolean, opts: { bubble: boolean; earlier: Stage["earlier"] }) {
    const bubbleId = r.id;
    if (opts.bubble) {
      push({ kind: "request", id: bubbleId, action: r.action, why: r.source === "agent" && r.action === consulting.forbidden.name, forced: r.source === "forced", verdict: null });
    }
    setPulse(r.mandateId === MANDATE_ID ? "Original" : "Amended");
    setStage({ action: r.action, phase: "checking", receipt: r, checksShown: 0, earlier: opts.earlier });
    await sleep(700);
    if (!alive()) return;
    const n = shownChecks(r.checks, r.action).length;
    for (let i = 1; i <= n; i++) {
      setStage((s) => s && { ...s, phase: "checks", checksShown: i });
      await sleep(120);
      if (!alive()) return;
    }
    setStage((s) => s && { ...s, phase: "done" });
    setPulse(null);
    setRevealed((v) => new Set(v).add(r.id));
    await sleep(350);
    if (!alive()) return;
    if (opts.bubble) patch(bubbleId, { verdict: r.decision });
    push({ kind: "reply", id: nextId(), tone: r.decision === "ALLOWED" ? "good" : "bad", text: COPY.replies[r.decision], to: r.kind === "dispute" ? "firm" : "agent" });
    await sleep(500);
  }

  const original = data?.slips.find((s) => s.label === "Original");
  const hasBlocked = !!data?.receipts.some((r) => r.decision === "BLOCKED" && r.kind === "action");
  const disputed = !!data?.receipts.some((r) => r.kind === "dispute");

  const actions = {
    preview: () => {
      setAttached("poisoned");
      setPreview((p) => (p === "closed" ? "open" : p === "open" ? "revealed" : "closed"));
    },
    grant: () => beat(async (alive) => {
      setGranting(true);
      try {
        await api.sign(data!.scenario.id);
      } finally {
        setGranting(false);
      }
      if (!alive()) return;
      await refresh();
      push({ kind: "reply", id: nextId(), tone: "good", text: COPY.grant.reply, to: "agent" });
    }),
    ask: (reportId: ReportId) => beat(async (alive) => {
      setPreview("closed");
      setAttached(reportId);
      const file = COPY.attachments[reportId];
      push({ kind: "analyst", id: nextId(), text: COPY.analyst, attachment: file });
      const statusId = nextId();
      push({ kind: "status", id: statusId, text: `Reading ${file}…`, done: false });
      setStage(null);
      const res = await api.run(reportId);
      if (!alive()) return;
      patch(statusId, { text: `✓ Read ${file}`, done: true });
      await refresh();
      await sleep(300);
      const ordered = [...res.receipts].sort((a, b) => Number(b.decision === "ALLOWED") - Number(a.decision === "ALLOWED"));
      let earlier: Stage["earlier"] = null;
      for (const r of ordered) {
        if (!alive()) return;
        await reveal(r, alive, { bubble: true, earlier });
        earlier = { action: r.action, decision: r.decision };
      }
      if (!alive()) return;
      const allowed = ordered.find((r) => r.decision === "ALLOWED");
      const answer = allowed ? answerFrom(allowed.data) : null;
      if (answer) push({ kind: "answer", id: nextId(), text: answer });
      else if (ordered.length === 0) push({ kind: "answer", id: nextId(), text: "No data requested." });
    }),
    force: () => beat(async (alive) => {
      const r = await api.act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action: data!.scenario.forbidden.name });
      if (!alive()) return;
      await refresh();
      await reveal(r, alive, { bubble: true, earlier: null });
    }),
    dispute: () => beat(async (alive) => {
      const msgId = nextId();
      push({ kind: "firm", id: msgId, text: COPY.dispute, attachment: "Permission #2" });
      const blocked = data!.receipts.find((r) => r.decision === "BLOCKED" && r.kind === "action");
      setStage({ action: blocked?.action ?? data!.scenario.forbidden.name, phase: "checking", receipt: null, checksShown: 0, earlier: null });
      const r = await api.dispute();
      if (!alive()) return;
      const s = await refresh();
      const amended = s?.slips.find((x) => x.label === "Amended");
      if (amended) patch(msgId, { attachment: `Permission #2 · dated ${weekday(amended.mandate.issuedAt)}` });
      await sleep(600);
      await reveal(r, alive, { bubble: false, earlier: null });
    }),
    reset: async () => {
      if (!resetArmed) {
        setResetArmed(true);
        setTimeout(() => setResetArmed(false), 2500);
        return;
      }
      setResetArmed(false);
      token.current++;
      setBusy(true);
      try {
        await api.reset();
        setFeed([]);
        setStage(null);
        setPulse(null);
        setRevealed(new Set());
        setPreview("closed");
        setAttached("clean");
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        await refresh();
      }
    },
  };

  const keys: { key: string; label: string; run: () => void; enabled: boolean; why?: string }[] = [
    { key: "1", label: preview === "closed" ? "Open report" : preview === "open" ? "Show hidden" : "Close report", run: actions.preview, enabled: true },
    { key: "2", label: "Grant", run: actions.grant, enabled: !original, why: "Already granted" },
    { key: "3", label: "Ask", run: () => actions.ask("clean"), enabled: !!original, why: "Grant first" },
    { key: "4", label: "Ask v2", run: () => actions.ask("poisoned"), enabled: !!original, why: "Grant first" },
    { key: "5", label: "Force", run: actions.force, enabled: !!original, why: "Grant first" },
    { key: "6", label: "Dispute", run: actions.dispute, enabled: hasBlocked && !disputed, why: hasBlocked ? "Already disputed" : "Block a request first" },
    { key: "0", label: resetArmed ? "Press 0 again" : "Reset", run: actions.reset, enabled: true },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      const k = keys.find((x) => x.key === e.key);
      if (!k || !k.enabled) return;
      if (busy && k.key !== "0" && k.key !== "1") return;
      k.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data) return <div className="stage-loading">{error ?? "Loading…"}</div>;

  const scene = !original ? 1 : disputed ? 3 : 2;
  const blocked = data.receipts.find((r) => r.decision === "BLOCKED" && r.kind === "action" && revealed.has(r.id)) ?? null;

  return (
    <div className="stage">
      <header className="stage-header">
        <div className="stage-brand">
          <img src="/envoi-logo.png" alt="" />
          <span>Envoi</span>
          {isMock && <span className="mock-badge">{COPY.mock}</span>}
        </div>
        <ol className="stage-steps">
          {COPY.steps.map((s, i) => {
            const n = i + 1;
            return (
              <li key={s} className={n === scene ? "current" : n < scene ? "done" : ""}>
                <span className="step-n">{n < scene ? "✓" : n}</span> {s}
              </li>
            );
          })}
        </ol>
        <span className="stage-fictional">{COPY.fictional}</span>
      </header>

      <main className="stage-cols">
        <BainePane
          feed={feed}
          preview={preview}
          attached={attached}
          report={data.scenario.reports.poisoned}
          canSend={!!original && !busy}
          onSend={() => actions.ask(attached)}
          onClosePreview={() => setPreview("closed")}
        />
        <ChainColumn slips={data.slips} blocked={blocked} pulse={pulse} />
        <MorganPane
          granted={!!original}
          granting={granting}
          canGrant={!busy}
          onGrant={actions.grant}
          stage={stage}
          error={error}
        />
      </main>

      <footer className="stage-keys" aria-label="Driver keys">
        {keys.map((k) => (
          <button
            key={k.key}
            disabled={!k.enabled || (busy && k.key !== "0" && k.key !== "1")}
            title={!k.enabled ? k.why : undefined}
            onClick={k.run}
            className={k.key === "0" && resetArmed ? "armed" : ""}
          >
            <kbd>{k.key}</kbd> {k.label}
          </button>
        ))}
        <span className="keys-note"><kbd>V</kbd> classic view</span>
      </footer>
    </div>
  );
}
