// Three-column stage: Baine (left) · Monad (middle) · JT Morgan (right).
// Holds state and the choreography. Every outcome comes from an API response;
// this file only reveals real results at human speed.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Receipt, ReportId, Slip, StateResponse } from "@shared/contract";
import { AGENT_ID, MANDATE_ID } from "@shared/contract";
import { consulting } from "@shared/scenarios";
import { api } from "../api";
import RequestFeedback, { type ConnectionStatus } from "../RequestFeedback";
import { COPY, answerFrom, shownChecks, weekday } from "../labels";
import BainePane from "./BainePane";
import ChainColumn from "./ChainColumn";
import MorganPane from "./MorganPane";
import type { FeedItem, Preview, Stage } from "./types";
import { type Attachment, partsFromScenario, readUpload } from "./upload";
import "./split.css";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => (reducedMotion() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
let seq = 0;

/** Atlas's own words from a real model run; stub and mock text is skipped. */
function liveWords(transcript: string): string | null {
  const t = transcript.trim();
  if (!t || /^\((stub|mock)\)/i.test(t)) return null;
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}
const nextId = () => `f${++seq}`;

export default function SplitApp() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [pulse, setPulse] = useState<Slip["label"] | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview>("closed");
  const builtin = (reportId: ReportId): Attachment => ({ kind: "builtin", reportId, fileName: COPY.attachments[reportId] });
  const [attached, setAttached] = useState<Attachment>(builtin("clean"));
  const [injectedUpload, setInjectedUpload] = useState<Attachment | null>(null);
  const [examples, setExamples] = useState({ clean: false, poisoned: false });
  const [activeStep, setActiveStep] = useState(1);
  const [allowedReceipt, setAllowedReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: "checking", message: "Reading server status…" });
  const [rechecking, setRechecking] = useState(false);
  const pending = useSyncExternalStore(api.subscribeToPending, api.pendingAction, api.pendingAction);
  const chainUnavailable = connection.state !== "unverified";
  const controlsBusy = busy || rechecking || pending?.phase === "waiting";
  const canSubmit = !controlsBusy && !pending && !chainUnavailable;
  const operation = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = useRef(0); // bumps on reset so a running choreography stops

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setData(s);
      return s;
    } catch (e) {
      setError((previous) => previous ?? (e as Error).message);
      return null;
    }
  }, []);

  async function recheckAttempt(receipt: Receipt, attemptId: string) {
    if (operation.current || api.pendingAction()?.phase === "waiting") return;
    operation.current = true;
    setRechecking(true);
    setError(null);
    try {
      const updated = await api.reconcile(attemptId, receipt.id);
      setData((current) => current && { ...current, receipts: current.receipts.map((r) => r.id === updated.id ? updated : r) });
      setStage((current) => current?.receipt?.id === updated.id ? { ...current, receipt: updated } : current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setRechecking(false);
      operation.current = false;
    }
  }

  const checkStatus = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setRechecking(true);
    setError(null);
    setConnection({ state: "checking", message: "Reading server status…" });
    const [stateResult, healthResult] = await Promise.allSettled([api.state(), api.health()]);
    if (stateResult.status === "fulfilled") {
      const s = stateResult.value;
      setData(s);
      setRevealed(new Set(s.receipts.map((r) => r.id)));
      if (s.slips.some((slip) => slip.label === "Original")) setActiveStep(2);
      const latest = s.receipts[0];
      if (latest) setStage({ action: latest.action, receipt: latest, phase: "done", checksShown: 5, earlier: null });
    } else setError((stateResult.reason as Error).message);
    if (healthResult.status === "rejected" || stateResult.status === "rejected") {
      setConnection({ state: "unavailable", message: "Could not read the server and demo status; check again before submitting." });
      if (healthResult.status === "rejected") setError((previous) => previous ?? (healthResult.reason as Error).message);
    } else if (!healthResult.value.ok || healthResult.value.mockChain) {
      setConnection({ state: "unavailable", message: healthResult.value.mockChain
        ? "Practice-chain mode is enabled; the live demo is blocked."
        : "The server reported a failed health check." });
    } else {
      setConnection({ state: "unverified", message: "Server responded; signing and the Monad connection are not yet verified." });
    }
    operation.current = false;
    setRechecking(false);
  }, []);

  useEffect(() => {
    void checkStatus();
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [checkStatus]);

  const push = (item: FeedItem) => setFeed((f) => [...f, item]);
  const patch = (id: string, change: Partial<FeedItem>) =>
    setFeed((f) => f.map((x) => (x.id === id ? ({ ...x, ...change } as FeedItem) : x)));

  /** Wrap a beat: lock the controls, catch the one-sentence error. */
  async function beat(fn: (alive: () => boolean) => Promise<void>) {
    if (operation.current || chainUnavailable || api.pendingAction()) return;
    operation.current = true;
    const mine = token.current;
    const alive = () => token.current === mine;
    setBusy(true);
    setError(null);
    try {
      await fn(alive);
    } catch (e) {
      if (alive()) {
        setError((e as Error).message);
        setPulse(null);
        setFeed((f) => f.map((x) => (x.kind === "status" && !x.done ? { ...x, done: true } : x)));
      }
    } finally {
      if (alive()) {
        await refresh();
        setBusy(false);
        operation.current = false;
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
    if (r.decision === "ALLOWED" && r.action === consulting.allowed.name) setAllowedReceipt(r);
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
      setPreview((p) => (p === "closed" ? "open" : p === "open" ? "revealed" : "closed"));
    },
    grant: () => beat(async (alive) => {
      setActiveStep(1);
      setGranting(true);
      try {
        await api.sign(data!.scenario.id);
      } finally {
        setGranting(false);
      }
      if (!alive()) return;
      await refresh();
      push({ kind: "reply", id: nextId(), tone: "good", text: COPY.grant.reply, to: "agent" });
      setActiveStep(2);
    }),
    upload: async (file: File) => {
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      setError(null);
      try {
        const upload = await readUpload(file);
        setAttached(upload);
        setInjectedUpload(upload);
        setPreview("open");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        operation.current = false;
        setBusy(false);
      }
    },
    ask: (which: ReportId | Attachment) => beat(async (alive) => {
      const att = typeof which === "string" ? builtin(which) : which;
      const reportId = att.kind === "upload" ? "poisoned" : att.reportId;
      setActiveStep(reportId === "clean" ? 2 : 3);
      setAllowedReceipt(null);
      setPreview("closed");
      setAttached(att);
      const file = att.fileName;
      push({ kind: "analyst", id: nextId(), text: COPY.analyst, attachment: file });
      const statusId = nextId();
      push({ kind: "status", id: statusId, text: `Reading ${file}…`, done: false });
      setStage(null);
      const res = att.kind === "upload"
        ? api.run("poisoned", { fileName: att.fileName, text: att.text })
        : api.run(att.reportId);
      const out = await res;
      if (!alive()) return;
      patch(statusId, { text: `✓ Read ${file}`, done: true });
      const said = liveWords(out.transcript);
      if (said) push({ kind: "answer", id: nextId(), text: said });
      await refresh();
      await sleep(300);
      const ordered = [...out.receipts].sort((a, b) => Number(b.decision === "ALLOWED") - Number(a.decision === "ALLOWED"));
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
      setExamples((previous) => ({ ...previous, [reportId]: true }));
    }),
    evidence: () => {
      setActiveStep(4);
      setPreview("closed");
      document.getElementById("monad-evidence")?.focus({ preventScroll: true });
    },
    force: () => beat(async (alive) => {
      setAllowedReceipt(null);
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
      if (operation.current) return;
      if (!resetArmed) {
        setResetArmed(true);
        resetTimer.current = setTimeout(() => setResetArmed(false), 2500);
        return;
      }
      if (resetTimer.current) clearTimeout(resetTimer.current);
      setResetArmed(false);
      operation.current = true;
      token.current++;
      setBusy(true);
      try {
        await api.reset();
        setFeed([]);
        setStage(null);
        setPulse(null);
        setRevealed(new Set());
        setPreview("closed");
        setAttached(builtin("clean"));
        setInjectedUpload(null);
        setExamples({ clean: false, poisoned: false });
        setActiveStep(1);
        setAllowedReceipt(null);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        await refresh();
        setBusy(false);
        operation.current = false;
      }
    },
  };

  const keys: { key: string; label: string; run: () => void; enabled: boolean; why?: string }[] = [
    { key: "1", label: "Grant", run: actions.grant, enabled: !original && canSubmit, why: pending ? "Check the unconfirmed action first" : chainUnavailable ? "Check server status first" : "Already granted" },
    { key: "2", label: "Clean example", run: () => actions.ask("clean"), enabled: !!original && canSubmit, why: pending ? "Check the unconfirmed action first" : "Grant first" },
    { key: "3", label: "Injected example", run: () => actions.ask(injectedUpload ?? "poisoned"), enabled: !!original && examples.clean && canSubmit, why: pending ? "Check the unconfirmed action first" : original ? "Run the clean example first" : "Grant first" },
    { key: "4", label: "Monad evidence", run: actions.evidence, enabled: !!original, why: "Grant first" },
    { key: "r", label: preview === "closed" ? "Open report" : preview === "open" ? "Show hidden text" : "Close report", run: actions.preview, enabled: true },
    { key: "5", label: "Force request", run: actions.force, enabled: !!original && canSubmit, why: pending ? "Check the unconfirmed action first" : "Grant first" },
    { key: "6", label: "Dispute", run: actions.dispute, enabled: hasBlocked && !disputed && canSubmit, why: pending ? "Check the unconfirmed action first" : hasBlocked ? "Already disputed" : "Block a request first" },
    { key: "0", label: resetArmed ? "Press 0 again" : "Reset", run: actions.reset, enabled: true },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = keys.find((x) => x.key === e.key.toLowerCase());
      if (!k || !k.enabled) return;
      if (controlsBusy) return;
      e.preventDefault();
      k.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!data) return <main className="preflight">
    <h1>Envoi</h1>
    <RequestFeedback connection={connection} pending={pending} error={error}
      onRecheck={() => { void checkStatus(); }} rechecking={rechecking} busy={busy} />
  </main>;

  const stepComplete = [!!original, examples.clean, examples.poisoned, false];
  const blocked = data.receipts.find((r) => r.decision === "BLOCKED" && r.kind === "action" && revealed.has(r.id)) ?? null;

  return (
    <div className="stage" data-demo-busy={controlsBusy}>
      <header className="stage-header">
        <div className="stage-brand">
          <img src="/envoi-logo.png" alt="" />
          <span>Envoi</span>
        </div>
        <ol className="stage-steps" aria-label="Demo order">
          {COPY.steps.map((s, i) => {
            const n = i + 1;
            return (
              <li key={s} aria-current={n === activeStep ? "step" : undefined} className={n === activeStep ? "current" : stepComplete[i] ? "done" : ""}>
                <span className="step-n">{stepComplete[i] && n !== activeStep ? "✓" : n}</span> {s}
              </li>
            );
          })}
        </ol>
        <div className="stage-summary">
          <span className="request-counter" aria-live="polite"><span className="counter-value" key={data.counter}>{data.counter}</span> requests checked</span>
          <span className="stage-fictional">{COPY.fictional}</span>
        </div>
      </header>

      <main className="stage-cols">
        <BainePane
          feed={feed}
          preview={preview}
          attachment={attached}
          previewParts={attached.kind === "upload" ? attached.parts : partsFromScenario(data.scenario.reports[attached.reportId])}
          canSend={!!original && canSubmit && (attached.kind === "builtin" && attached.reportId === "clean" || examples.clean)}
          canUpload={!controlsBusy}
          sendReason={!original ? "Grant first" : !examples.clean && attached.kind === "upload" ? "Run the clean example first" : undefined}
          onSend={() => actions.ask(attached)}
          onUpload={actions.upload}
          onClosePreview={() => setPreview("closed")}
          onToggleHidden={() => setPreview((p) => p === "revealed" ? "open" : "revealed")}
          busy={controlsBusy}
        />
        <ChainColumn slips={data.slips} blocked={blocked} pulse={pulse} receipts={data.receipts.filter((r) => revealed.has(r.id))} review={activeStep === 4}
          busy={controlsBusy} onRecheck={(receipt, attemptId) => { void recheckAttempt(receipt, attemptId); }} />
        <MorganPane
          granted={!!original}
          granting={granting}
          canGrant={canSubmit}
          onGrant={actions.grant}
          stage={stage}
          error={error}
          allowedReceipt={allowedReceipt}
          connection={connection}
          pending={pending}
          onRecheck={() => { void checkStatus(); }}
          rechecking={rechecking}
          busy={busy}
        />
      </main>

      <footer className="stage-keys" aria-label="Driver keys">
        {keys.map((k) => (
          <button
            key={k.key}
            disabled={!k.enabled || controlsBusy}
            title={controlsBusy ? "Wait for the current operation to finish" : !k.enabled ? k.why : undefined}
            aria-keyshortcuts={k.key.toUpperCase()}
            data-key={k.key}
            onClick={k.run}
            className={`${Number(k.key) >= 1 && Number(k.key) <= 4 ? "primary-step" : "auxiliary-key"} ${k.key === "0" && resetArmed ? "armed" : ""}`}
          >
            <kbd>{k.key.toUpperCase()}</kbd> {k.label}
          </button>
        ))}
        <span className="keys-note"><kbd>V</kbd> classic view</span>
      </footer>
    </div>
  );
}
