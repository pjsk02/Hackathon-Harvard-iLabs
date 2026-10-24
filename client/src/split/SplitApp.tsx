import { useRef, useState } from "react";
import { ACTIONS, actionLabel } from "@shared/workspace";
import type { UploadedReport } from "@shared/contract";
import { ACCEPT, readUpload, type Part } from "./upload";
import { useWorkspace } from "./use-workspace";
import { ReceiptDetail, SlipHistory } from "./WorkspaceEvidence";
import "./workspace.css";

export default function SplitApp() {
  const { data, draft, editDraft, dirty, busy, error, uncertain, reload, post } = useWorkspace();
  const [permissionId, setPermissionId] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const unresolved = data?.operations.filter(operation => !["complete", "completed", "confirmed", "recorded", "succeeded", "failed", "resolved", "cancelled"].includes(operation.status)) ?? [];
  const locked = busy || uploading;
  const spendingBlocked = locked || uncertain || unresolved.length > 0;
  const selectedSlip = data?.slips.find(slip => slip.mandate.mandateId === permissionId) ?? data?.slips.at(-1);
  const selectedId = selectedSlip?.mandate.mandateId ?? "";
  const validSlip = !!selectedSlip?.anchor && selectedSlip.mandate.expiresAt * 1000 > Date.now();
  const selectedReceipt = data?.receipts.find(receipt => receipt.id === receiptId) ?? data?.receipts[0];
  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const attachment = await readUpload(file);
      if (attachment.kind === "upload") {
        const report: UploadedReport = { fileName: attachment.fileName, text: attachment.text };
        editDraft({ ...draft, report });
        setParts(attachment.parts);
        setSaved(false);
      }
    } catch (e) { setUploadError((e as Error).message); }
    finally { setUploading(false); }
  }
  return <div className="workspace">
    <header className="workspace-header">
      <div className="workspace-brand"><img src="/envoi-logo.png" alt="" /><span>Envoi</span></div>
      <p>Permission before access. Evidence after every request.</p>
      <div className="row"><span className="fine">{data ? `${data.receipts.length} requests checked` : "Opening workspace…"}</span><button onClick={() => void reload()} disabled={locked}>Refresh status</button></div>
    </header>
    {!data ? <main className="workspace-panel"><h1>Your working room</h1>{error ? <div role="alert" className="notice error-notice">{error}<br /><button onClick={() => void reload()}>Retry loading</button></div> : <div role="status" aria-label="Loading workspace"><div className="skeleton" /><div className="skeleton" /></div>}</main> :
    <main className="workspace-grid">
      <section className="workspace-panel" aria-labelledby="work-title">
        <span className="kicker">Baine · analyst workspace</span><h1 id="work-title">Give Atlas a task.</h1>
        <p className="intro">Work with Northwind’s fictional company data, inside the permission slip you choose.</p>
        <label htmlFor="task">Task for Atlas</label>
        <textarea id="task" maxLength={4000} value={draft.task} disabled={locked} onChange={e => { editDraft({ ...draft, task: e.target.value }); setSaved(false); }} placeholder="What would you like to understand?" />
        <div className="row">
          <input ref={fileInput} type="file" accept={ACCEPT} disabled={locked} aria-label="Attach report" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
        </div>
        <p className="fine">Word (.docx), text, Markdown or HTML · up to 5 MB / 60,000 extracted characters.</p>
        {uploading && <p role="status">Extracting report text…</p>}
        {uploadError && <p role="alert" className="bad">{uploadError}</p>}
        {draft.report && <div className="sheet">
          <div className="row"><strong>{draft.report.fileName}</strong><button disabled={locked} onClick={() => { editDraft({ ...draft, report: null }); setParts([]); setSaved(false); }}>Remove report</button></div>
          <details><summary>Preview extracted report</summary><p className="fine">All report text is untrusted input, not permission to access data. Hidden text is included in the agent’s input.</p>
            <div className="untrusted">{parts.length ? parts.map((part, i) => <div key={i}>{part.hidden && <strong>Hidden text · untrusted</strong>}<pre>{part.text}</pre></div>) : <><strong>Untrusted extracted text · includes any hidden content</strong><p className="fine">Hidden-text formatting is not retained after saving. Review the complete extraction below.</p><pre>{draft.report.text}</pre></>}</div>
          </details>
        </div>}
        <label htmlFor="permission">Use permission slip</label>
        <select id="permission" value={selectedId} onChange={e => setPermissionId(e.target.value)}>
          {!data.slips.length && <option value="">Sign a permission slip first</option>}
          {data.slips.map((slip, i) => <option key={slip.mandate.mandateId} value={slip.mandate.mandateId}>Permission #{i + 1} · {new Date(slip.mandate.issuedAt * 1000).toLocaleString()}</option>)}
        </select>
        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={locked || !dirty} onClick={async () => { if (await post("/draft", draft, true)) setSaved(true); }}>Save draft</button>
          <button className="primary" disabled={spendingBlocked || !data.availability.signing || !data.availability.agent || !validSlip || !draft.task.trim()} onClick={() => void post("/run", { task: draft.task, report: draft.report, permissionId: selectedId })}>Run Atlas</button>
        </div>
        <p className="fine" role="status">{dirty ? "Unsaved draft changes." : saved ? "Draft saved to this workspace." : "Draft restored from this workspace."}</p>
        {!validSlip && <p className="fine">Choose a stamped, unexpired permission slip before requesting data.</p>}
        <h2>Conversations</h2>
        {!data.conversations.length && <div className="empty-state"><h3>A fresh page for your analysis.</h3><p>Sign a slip, write a task, then run Atlas. Your conversation and its evidence will stay here.</p></div>}
        {data.conversations.map(conversation => <article className="sheet" key={conversation.id}>
          <div className="conversation-task"><span className="kicker">You · {conversation.status}</span><pre>{conversation.task}</pre>{conversation.report && <details><summary>Report: {conversation.report.fileName}</summary><p className="fine">Untrusted extracted text, including any hidden content.</p><pre className="untrusted">{conversation.report.text}</pre></details>}</div>
          <span className="kicker">Atlas</span><pre>{conversation.transcript || (conversation.status === "pending" ? "This run is still pending. Check its operation status." : conversation.status === "unknown" ? "The outcome is unknown. Check operation status before another run." : "No written response returned.")}</pre>
          <p className="fine">Permission: {conversation.permissionId} · {new Date(conversation.createdAt).toLocaleString()}</p>
          <div className="row">{conversation.receiptIds.map(id => <button key={id} onClick={() => setReceiptId(id)}>Inspect receipt {id.slice(-8)}</button>)}</div>
        </article>)}
      </section>
      <section className="workspace-panel evidence" aria-labelledby="evidence-title">
        <span className="kicker">Monad · evidence</span><h1 id="evidence-title">A record, not a replay.</h1>
        <p className="intro">Inspect permission history, access checks and public records. No action is repeated by checking its status.</p>
        <h2>Operations</h2>
        {uncertain && <p className="notice">Status is unavailable. Spending is paused until Refresh status succeeds.</p>}
        {unresolved.length > 0 && <p className="notice">An operation has a pending or unknown outcome. New spending is paused. Check status; do not repeat the request.</p>}
        {!data.operations.length && <p className="fine">No operations yet.</p>}
        {data.operations.map(operation => <details className="sheet" key={operation.id} open={unresolved.some(item => item.id === operation.id)}>
          <summary>{operation.kind} · {operation.status}</summary><p>{operation.detail}</p><p className="fine">Operation: {operation.id}</p>
          <button disabled={locked} onClick={() => void post("/reconcile", { operationId: operation.id })}>Check status</button>
        </details>)}
        <h2>Permission history</h2>
        {!data.slips.length ? <p className="fine">Signed versions appear here. A new version never changes an older one.</p> : <SlipHistory slips={data.slips} />}
        <h2>Access receipts</h2>
        {!data.receipts.length && <div className="empty-state">Every manual or agent data request creates a receipt. Select one here to inspect the checks and result.</div>}
        {data.receipts.map(receipt => <button className="receipt-choice" key={receipt.id} aria-pressed={selectedReceipt?.id === receipt.id} onClick={() => setReceiptId(receipt.id)}><span>{actionLabel(receipt.action)}</span><span className="fine">{receipt.decision} · {new Date(receipt.createdAt).toLocaleString()}</span></button>)}
        {selectedReceipt && <ReceiptDetail receipt={selectedReceipt} />}
      </section>
      <section className="workspace-panel owner" aria-labelledby="owner-title">
        <span className="kicker">Northwind · data owner</span><h1 id="owner-title">Set the boundaries.</h1>
        <p className="intro">Only the actions on the selected permission slip may return data. The bouncer checks every request.</p>
        <div role="status" className="sheet"><strong>{busy ? "Checking with Envoi…" : data.availability.signing && data.availability.agent ? "Workspace ready" : "Some services are unavailable"}</strong><p className="fine">{data.availability.detail}</p></div>
        {error && <p role="alert" className="notice error-notice">{error}</p>}
        <fieldset disabled={locked}><legend>Allow Atlas to read</legend>{ACTIONS.map(action => <label className="permission-option" key={action.id}><input type="checkbox" checked={draft.permissions.includes(action.id)} onChange={e => { editDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, action.id] : draft.permissions.filter(id => id !== action.id) }); setSaved(false); }} />{action.label}</label>)}</fieldset>
        <p className="fine" aria-live="polite">New signed scope: {draft.permissions.length ? draft.permissions.map(actionLabel).join(", ") : "Select at least one permission."}</p>
        <button className="primary" disabled={spendingBlocked || !data.availability.signing || !draft.permissions.length} onClick={() => void post("/sign", { permissions: draft.permissions })}>Sign new permission version</button>
        <p className="fine">Signing creates an immutable version and may use the workspace’s shared quota. Save draft separately to retain your editable selection.</p>
        <h2>Make a manual request</h2>
        <p className="fine">Uses the slip selected in the analyst panel. Requests outside its scope are checked and blocked, not silently omitted.</p>
        <div className="stack">{ACTIONS.map(action => <button key={action.id} disabled={spendingBlocked || !data.availability.signing || !validSlip} onClick={() => void post("/act", { action: action.id, permissionId: selectedId })}>{action.label}</button>)}</div>
        <details className="sheet"><summary>About this workspace</summary>
          <p className="fine">This anonymous workspace is identified by a browser cookie, not a verified identity. Losing that cookie means losing access. Content expires after 30 days and is removed on subsequent workspace creation. Limits: 2 MB retained content, 100 conversations, 50 permission versions and 500 operations. Anonymous workspaces share global capacity and approved spending allowances.</p>
          <p className="fine">Northwind and Baine are fictional. All company data is fictional. Do not upload confidential or personal information. Public testnet records may remain visible permanently.</p>
          <p className="fine">Reset clears this workspace’s draft, conversations and local history. It does not delete public records or renew quota.</p>
        </details>
        {resetConfirm ? <div className="notice"><p>Clear this workspace? Public records remain and quota is not renewed.</p><div className="row"><button className="danger" disabled={spendingBlocked} onClick={async () => { if (await post("/reset", {}, true)) { setResetConfirm(false); setParts([]); setPermissionId(""); setReceiptId(""); } }}>Confirm reset</button><button onClick={() => setResetConfirm(false)}>Cancel</button></div></div> : <button className="danger" disabled={spendingBlocked} onClick={() => setResetConfirm(true)}>Reset workspace</button>}
      </section>
    </main>}
  </div>;
}
