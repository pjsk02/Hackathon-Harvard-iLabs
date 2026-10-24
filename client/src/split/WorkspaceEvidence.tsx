import type { Receipt, Slip } from "@shared/contract";
import { actionLabel } from "@shared/workspace";

export function safeExplorerUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["testnet.monadvision.com", "testnet.monadexplorer.com"].includes(url.hostname) &&
      /^\/tx\/0x[a-fA-F0-9]{64}\/?$/.test(url.pathname) && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
export function PublicRecord({ url }: { url?: string | null }) {
  const safe = safeExplorerUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">View public record ↗</a> : null;
}
function cell(value: unknown): string {
  return value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function ResultData({ data }: { data: unknown }) {
  if (data == null) return <p className="fine">No data was returned.</p>;
  const collection = Array.isArray(data) ? data : typeof data === "object" ?
    Object.values(data as Record<string, unknown>).find(Array.isArray) : null;
  if (Array.isArray(collection) && collection.length && collection.every(row => row !== null && typeof row === "object" && !Array.isArray(row))) {
    const rows = collection as Record<string, unknown>[];
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    return <div className="result-scroll" tabIndex={0} aria-label="Result data"><table><caption className="fine">Returned data · fictional company records</caption><thead><tr>{columns.map(key => <th key={key} scope="col">{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(key => <td key={key}>{cell(row[key])}</td>)}</tr>)}</tbody></table></div>;
  }
  if (typeof data === "object" && !Array.isArray(data)) return <table><caption className="fine">Returned data · fictional company records</caption><tbody>{Object.entries(data).map(([key, value]) => <tr key={key}><th scope="row">{key.replaceAll("_", " ")}</th><td>{cell(value)}</td></tr>)}</tbody></table>;
  return <pre>{cell(data)}</pre>;
}
export function SlipHistory({ slips }: { slips: Slip[] }) {
  return <>{slips.map((slip, i) => <details className="sheet" key={slip.mandate.mandateId}>
    <summary>Permission #{i + 1} · {slip.anchor ? "Notary stamp recorded" : "Notary stamp not confirmed"}</summary>
    <p className="fine">Reference: {slip.mandate.mandateId}</p>
    <p className="fine">Signed: {new Date(slip.mandate.issuedAt * 1000).toLocaleString()}<br />Valid until: {new Date(slip.mandate.expiresAt * 1000).toLocaleString()}</p>
    <ul>{slip.mandate.allowedActions.map(action => <li key={action}>{actionLabel(action)}</li>)}</ul>
    {slip.anchor && <p className="fine">Monad testnet · block {slip.anchor.blockNumber}<br /><PublicRecord url={slip.anchor.explorerUrl} /></p>}
  </details>)}</>;
}
export function matchedAttemptUrl(receipt: Receipt): string | null {
  if (!receipt.checks.some(check => check.id === "scope" && check.pass === false)) return null;
  const evidence = receipt.attemptEvidence;
  if (!evidence || evidence.status !== "recorded") return null;
  const record = evidence.record;
  const url = safeExplorerUrl(evidence.anchor.explorerUrl);
  if (!url || !/^0x[a-fA-F0-9]{64}$/.test(evidence.txHash) ||
    evidence.anchor.txHash !== evidence.txHash ||
    new URL(url).pathname.replace(/\/$/, "") !== `/tx/${evidence.txHash}` ||
    record.receiptId !== receipt.id || record.chainId !== 10143 ||
    record.action !== receipt.action || record.agent !== receipt.agentId ||
    record.source !== receipt.source || record.decision !== receipt.decision ||
    record.checks.length !== receipt.checks.length ||
    !receipt.checks.every(check => record.checks.some(item => item.id === check.id && item.pass === check.pass))) return null;
  return url;
}
export function ReceiptDetail({ receipt }: { receipt: Receipt }) {
  const scopeViolation = receipt.checks.some(check => check.id === "scope" && check.pass === false);
  const transactionUrl = matchedAttemptUrl(receipt);
  const pending = receipt.attemptEvidence?.status === "pending";
  return <article className="sheet">
    <span className="kicker">{actionLabel(receipt.action)}</span>
    <div className={`decision ${receipt.decision === "ALLOWED" ? "" : "blocked"}`}>{receipt.decision}</div>
    <p className="fine">{new Date(receipt.createdAt).toLocaleString()} · {receipt.source === "agent" ? "Agent request" : "Manual request"}<br />Permission: {receipt.mandateId}<br />Receipt: {receipt.id}</p>
    <ul className="checks">{receipt.checks.map(check => <li key={check.id}><span className={check.pass ? "good" : "bad"}>{check.pass ? "✓" : "×"} {check.label}</span><small>{check.detail}</small></li>)}</ul>
    {receipt.decision === "ALLOWED" ? <ResultData data={receipt.data} /> : <div className="fine">Data never left Goldman Stanley.</div>}
    <div className="fine" role="status">{!scopeViolation ? receipt.decision === "ALLOWED" ? "Within scope · no Monad transaction required." : "No scope violation · no Monad transaction required." : transactionUrl ? "Scope violation · transaction confirmed" : pending ? "Scope violation · transaction pending" : "Scope violation · transaction not recorded"}</div>
    {transactionUrl && <a href={transactionUrl} target="_blank" rel="noopener noreferrer">View request transaction ↗</a>}
    {scopeViolation && receipt.attemptEvidence && "detail" in receipt.attemptEvidence && <details><summary>Recording details</summary><div className="fine">{receipt.attemptEvidence.detail}</div></details>}
  </article>;
}
