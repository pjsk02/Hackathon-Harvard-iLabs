// Manual diagnostics only: a server response is not proof of signing or chain access.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HealthResponse, SelftestResponse } from "@shared/contract";
import { api } from "./api";
import RequestFeedback, { plainRequestError, type ConnectionStatus } from "./RequestFeedback";

export default function Preflight() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [test, setTest] = useState<SelftestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
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
    if (running || checking || api.pendingAction() || !health?.ok || health.mockChain || !health.issuer) return;
    setRunning(true);
    setTest(null);
    setTestError(null);
    try {
      setTest(await api.selftest());
    } catch (error) {
      setTestError(plainRequestError(error));
    } finally {
      try { await api.state(); } catch (error) { setRecoveryError(plainRequestError(error)); }
      setRunning(false);
    }
  }

  const connection: ConnectionStatus = checking
    ? { state: "checking", message: "Reading server status…" }
    : !health || !health.ok
      ? { state: "unavailable", message: "The server has not reported a successful health check." }
      : { state: "unverified", message: "Server responded. Signing, Monad readback and AI are not verified by this check." };

  return (
    <main className="preflight">
      <h1>Envoi pre-flight</h1>
      <p className="preflight-intro">Check the connection before granting access. Configuration is not proof that the live workflow works.</p>
      <RequestFeedback connection={connection} pending={pending} error={healthError ?? recoveryError}
        onRecheck={() => { void recheck(); }} rechecking={checking} busy={running} />
      {recoveryMessage && <p className="preflight-note" role="status">{recoveryMessage}</p>}
      <section className="card" aria-labelledby="preflight-configuration" aria-busy={checking}>
        <h2 className="preflight-heading" id="preflight-configuration">Reported configuration</h2>
        {checking && <><div className="preflight-skeleton" aria-hidden="true" /><p className="preflight-note" role="status">Reading configuration…</p></>}
        {!checking && !health && <p className="preflight-note">Unknown — server configuration could not be read.</p>}
        {health && (
          <ul className="plain preflight-config">
            <li className={health.ok ? "good" : "bad"}>Server check: {health.ok ? "responded" : "failed"}.</li>
            <li className={health.mockChain ? "bad" : "muted"}>Chain mode: {health.mockChain ? "practice mode; live requests blocked." : "real-chain mode configured; connection unknown."}</li>
            <li className={health.issuer ? "muted" : "bad"}>Signer: {health.issuer ? `${health.issuer.slice(0, 6)}…${health.issuer.slice(-4)} configured; signing unverified.` : "not configured; signing unavailable."}</li>
            <li>Network setting: {health.rpc || "unknown"}. Monad readback unverified.</li>
            <li>AI connection: unknown; not checked by server health.</li>
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="preflight-selftest" aria-busy={running}>
        <h2 className="preflight-heading" id="preflight-selftest">Self-test</h2>
        <p className="preflight-note" id="selftest-warning">Runs the workflow checks on the server. This may create real Monad records and change the shared session. It only runs when you choose it.</p>
        <button type="button" className="ghost" onClick={() => { void runTest(); }}
          aria-describedby="selftest-warning" disabled={running || checking || !!pending || !health?.ok || health.mockChain || !health.issuer}>
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
