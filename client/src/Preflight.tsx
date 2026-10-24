// Pre-flight panel (/?preflight=1): health plus the team self-test.
// For rehearsals and after each deploy. Not part of the demo screen.
import { useEffect, useState } from "react";
import type { HealthResponse, SelftestResponse } from "@shared/contract";
import { api } from "./api";

export default function Preflight() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [test, setTest] = useState<SelftestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setHealthError((e as Error).message));
  }, []);

  async function runTest() {
    setRunning(true);
    setTest(null);
    setTestError(null);
    try {
      setTest(await api.selftest());
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="preflight">
      <h1>Envoi pre-flight</h1>
      <section className="card">
        <h2>Server</h2>
        {healthError && <p className="bad">{healthError}</p>}
        {health && (
          <ul className="plain">
            <li className={health.ok ? "good" : "bad"}>{health.ok ? "✓" : "✕"} Server answers</li>
            <li className={health.mockChain ? "bad" : "muted"}>
              {health.mockChain ? "✕ Practice chain configured; the live demo is blocked." : "Real-chain mode selected; connection still needs verification."}
            </li>
            <li className={health.issuer ? "muted" : "bad"}>{health.issuer ? `Reported signer: ${health.issuer.slice(0, 6)}…${health.issuer.slice(-4)}; signing not yet verified.` : "✕ No signer configured"}</li>
            <li className="mono">Network: {health.rpc}</li>
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Self-test</h2>
        <button className="ghost" onClick={runTest} disabled={running}>{running ? "Running…" : "Run self-test"}</button>
        {testError && <p className="bad">{testError}</p>}
        {test && (
          <>
            <p className={test.pass ? "good" : "bad"}>{test.pass ? "✓ All scenes pass" : "✕ A scene failed"}</p>
            <table>
              <thead><tr><th>Scene</th><th>Expected</th><th>Got</th><th>Time</th></tr></thead>
              <tbody>
                {test.steps.map((s, i) => (
                  <tr key={i} className={s.expected === s.got ? "good" : "bad"}>
                    <td>{s.scene}</td><td>{s.expected}</td><td>{s.got}</td><td>{(s.ms / 1000).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <p className="muted small"><a href="/">← Back to the demo screen</a></p>
    </div>
  );
}
