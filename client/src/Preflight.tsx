// Read-only health checks verify local signing and finalized Monad access, never a model call or write.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HealthResponse, SelftestResponse } from "@shared/contract";
import { api } from "./api";
import RequestFeedback, { plainRequestError } from "./RequestFeedback";
import { canSelftest, healthStatus, readinessLines } from "./health-status";

export default function Preflight() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [test, setTest] = useState<SelftestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const pending = useSyncExternalStore(api.subscribeToPending, api.pendingAction, api.pendingAction);
  const active = useRef(false);

  const checkHealth = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setChecking(true);
    setHealthError(null);
    try {
      const [reported] = await Promise.all([api.health(), api.state()]);
      setHealth(reported);
    } catch (error) {
      setHealth(null);
      setHealthError(plainRequestError(error));
    } finally {
      active.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => { void checkHealth(); }, [checkHealth]);

  async function recheck() {
    if (active.current || running || pending?.phase === "waiting") return;
    active.current = true;
    setChecking(true);
    setHealthError(null);
    setRecoveryError(null);
    setRecoveryMessage(null);
    // Reads only. Never repeat a submission or assume a timeout cancelled it.
    const [healthResult, stateResult] = await Promise.allSettled([api.health(), api.state()]);
    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    else {
      setHealth(null);
      setHealthError(plainRequestError(healthResult.reason));
    }
    if (stateResult.status === "rejected") setRecoveryError("The current session record could not be read. Check status again before submitting more work.");
    else setRecoveryMessage("Current session record read. This does not verify every submitted action.");
    active.current = false;
    setChecking(false);
  }

  async function runTest() {
    if (running || checking || api.pendingAction() || !testConfirmed || !canSelftest(health)) return;
    setRunning(true);
    setTest(null);
    setTestError(null);
    try {
      const state = await api.state();
      if (state.slips.length || state.receipts.length || state.counter !== 0) {
        throw new Error("Self-test requires an empty session. Reset the demo explicitly before running it.");
      }
      setTest(await api.selftest());
    } catch (error) {
      setTestError(plainRequestError(error));
    } finally {
      // Read back after the manual POST, even if its response was lost. Never repeat it.
      try { await api.state(); } catch (error) { setRecoveryError(plainRequestError(error)); }
      setRunning(false);
      setTestConfirmed(false);
    }
  }

  const connection = healthStatus(health, { checking });
  const lines = health?.readiness ? readinessLines(health.readiness) : null;
  const selftestReady = canSelftest(health);

  return (
    <main className="preflight">
      <h1>Envoi pre-flight</h1>
      <p className="preflight-intro">Check local signing and a finalized Monad block before granting access. These checks submit no transactions and make no model call.</p>
      <RequestFeedback connection={connection} pending={pending} error={healthError ?? recoveryError}
        onRecheck={() => { void recheck(); }} rechecking={checking} busy={running} />
      {recoveryMessage && <p className="preflight-note" role="status">{recoveryMessage}</p>}
      <section className="card" aria-labelledby="preflight-configuration" aria-busy={checking}>
        <h2 className="preflight-heading" id="preflight-configuration">Readiness checks</h2>
        {checking && <><div className="preflight-skeleton" aria-hidden="true" /><p className="preflight-note" role="status">Reading configuration…</p></>}
        {!checking && !health && <p className="preflight-note">Unknown — server configuration could not be read.</p>}
        {health && (
          <ul className="plain preflight-config">
            <li className="muted">Server responded.</li>
            {lines ? <>
              <li className={health.readiness!.signing.status === "verified" ? "good" : "bad"}>{lines.signing}</li>
              <li className={health.mockChain || health.readiness!.monad.status !== "connected" ? "bad" : "good"}>
                {health.mockChain ? "Practice-chain mode; live demo blocked." : lines.monad}</li>
              <li>{lines.recording}</li>
              <li>{lines.ai}</li>
              <li>Checked at {new Date(health.readiness!.checkedAt).toLocaleString()}.</li>
            </> : <>
              <li>{health.mockChain ? "Practice-chain mode; live demo blocked." : "Real-chain mode configured; connection unverified."}</li>
              <li>Signing unverified; no local signature check reported.</li>
              <li>AI configuration and live testing unknown.</li>
              <li>Live recording allowance unknown.</li>
            </>}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="preflight-selftest" aria-busy={running}>
        <h2 className="preflight-heading" id="preflight-selftest">Self-test</h2>
        <p className="preflight-note" id="selftest-warning">Manual only. Requires an empty session and allowance for FOUR Monad transactions: permission, allowed attempt, blocked attempt, and amended permission. This changes the shared session. Checking status never runs this test.</p>
        {!selftestReady && !checking && <p className="preflight-note">Self-test unavailable: verify signing and Monad access, resume recording, and confirm at least four transactions remain.</p>}
        <label className="preflight-note"><input type="checkbox" checked={testConfirmed}
          disabled={running || checking || !!pending} onChange={(event) => setTestConfirmed(event.target.checked)} />
          {" "}I confirm the session must be empty and authorize these four transactions within the approved allowance.</label>
        <button type="button" className="ghost" onClick={() => { void runTest(); }}
          aria-describedby="selftest-warning" disabled={running || checking || !!pending || !testConfirmed || !selftestReady}>
          {running ? "Running self-test…" : "Run self-test"}
        </button>
        <div className="preflight-status" aria-live="polite">
          {running && <p>Waiting for self-test results. Do not submit another action.</p>}
          {!running && !test && !testError && <p className="preflight-note">No self-test result in this visit.</p>}
          {pending && !running && <p className="preflight-note">Self-test is unavailable while another action awaits confirmation.</p>}
          {testError && <p className="request-feedback-error bad" role="alert">{testError}{pending?.phase === "unconfirmed" ? " Submitted work may still complete; check status before running again." : ""}</p>}
          {test && <p className={test.pass ? "good" : "bad"}>{test.pass ? "Self-test reported all scenes passed." : "Self-test reported a failed scene."}</p>}
        </div>
        {test && <div className="preflight-table" tabIndex={0} role="region" aria-label="Self-test scene results">
          <table>
            <caption>Results from the manually requested self-test</caption>
            <thead><tr><th scope="col">Scene</th><th scope="col">Expected</th><th scope="col">Returned</th><th scope="col">Result</th></tr></thead>
            <tbody>{test.steps.map((step, index) => (
              <tr key={index}>
                <th scope="row">{step.scene}</th><td>{step.expected}</td><td>{step.got}</td>
                <td className={step.expected === step.got ? "good" : "bad"}>{step.expected === step.got ? "Passed" : "Failed"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!test.steps.length && <p className="preflight-note">No scene details were returned.</p>}
        </div>}
      </section>
      <p><a href="/">Back to the workspace</a></p>
    </main>
  );
}
