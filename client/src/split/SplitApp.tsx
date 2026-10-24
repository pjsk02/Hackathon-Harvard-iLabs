import { useRef, useState } from "react";
import { ACTIONS, actionLabel } from "@shared/workspace";
import type { UploadedReport } from "@shared/contract";
import { ACCEPT, readUpload, type Part } from "./upload";
import { useWorkspace } from "./use-workspace";
import { ReceiptDetail, SlipHistory } from "./WorkspaceEvidence";
import "./workspace.css";

type RequestInput = { task: string; report: UploadedReport | null };
type RunInput = RequestInput & { permissionId: string; previous: string[] };

export default function SplitApp() {
  const { data, draft, editDraft, busy, error, uncertain, reload, post } = useWorkspace();
  const [step, setStep] = useState(0);
  const [continued, setContinued] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<RequestInput | null>(null);
  const [run, setRun] = useState<RunInput | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previousConversationIds = useRef<Set<string> | null>(null);
  if (data && !previousConversationIds.current) previousConversationIds.current = new Set(data.conversations.map(item => item.id));
  const currentConversation = data?.conversations.filter(item => !previousConversationIds.current?.has(item.id)) ?? [];
  const locked = busy || uploading;
  const unresolved = data?.operations.filter(op => !["complete", "completed", "confirmed", "recorded", "succeeded", "failed", "resolved", "cancelled"].includes(op.status)) ?? [];
  const paused = uncertain || unresolved.length > 0;
  const matchingSlip = data?.slips.slice().reverse().find(slip =>
    !!slip.signature && !!slip.anchor && slip.mandate.agentId === "atlas-research-agent" &&
    slip.mandate.issuedAt * 1000 <= Date.now() && slip.mandate.expiresAt * 1000 > Date.now() &&
    slip.mandate.allowedActions.length === draft.permissions.length &&
    draft.permissions.every(action => slip.mandate.allowedActions.includes(action)));
  const result = run && data?.conversations.find(item => !run.previous.includes(item.id) &&
    item.permissionId === run.permissionId && item.task === run.task &&
    JSON.stringify(item.report) === JSON.stringify(run.report));
  const receipts = result ? data?.receipts.filter(receipt => result.receiptIds.includes(receipt.id) &&
    receipt.mandateId === result.permissionId && receipt.source === "agent") ?? [] : [];

  async function upload(file: File) {
    setUploading(true); setUploadError(null);
    try {
      const attachment = await readUpload(file);
      if (attachment.kind === "upload") {
        editDraft({ ...draft, report: { fileName: attachment.fileName, text: attachment.text } });
        setParts(attachment.parts);
      }
    } catch (e) { setUploadError((e as Error).message); }
    finally { setUploading(false); }
  }
  async function send() {
    if (locked || !draft.task.trim() || !data?.availability.chat) return;
    const input = { task: draft.task, report: draft.report };
    if (await post("/chat", { ...input, historyIds: currentConversation.filter(item => !item.permissionId).slice(-8).map(item => item.id) })) {
      setLastRequest(input);
      setRun(null);
      editDraft({ ...draft, task: "", report: null });
      setParts([]);
    }
  }

  return <div className="workspace">
    <header className="workspace-header">
      <div className="workspace-brand"><img src="/envoi-logo.png" alt="" /><span>Envoi</span></div>
      <button disabled={locked} onClick={() => void reload()}>Refresh status</button>
    </header>
    <main>
      <nav aria-label="Workspace steps"><ol className="step-progress">
        {["Permissions", "Chat", "Monad result"].map((label, i) => <li key={label}><button aria-current={step === i ? "step" : undefined} disabled={locked || (i === 1 && !continued) || (i === 2 && !lastRequest)} onClick={() => setStep(i)}>{i + 1} · {label}</button></li>)}
      </ol></nav>
      {!data ? <section className="workspace-panel"><h1>Opening workspace</h1>{error ? <div role="alert" className="notice error-notice">{error}<button onClick={() => void reload()}>Retry loading</button></div> : <div role="status" aria-label="Loading workspace"><div className="skeleton" /><div className="skeleton" /></div>}</section> : <>
        {error && <div role="alert" className="notice error-notice">{error}</div>}
        {busy && <div role="status" className="fine">Checking with Envoi…</div>}
        <section className="workspace-panel" aria-labelledby="screen-title">
          {step === 0 && <>
            <span className="kicker">Goldman Stanley · data owner</span><h1 id="screen-title">Set Atlas’s permissions.</h1>
            <fieldset disabled={locked}><legend>Allow Atlas to read</legend>{ACTIONS.map(action => <label className="permission-option" key={action.id}><input type="checkbox" checked={draft.permissions.includes(action.id)} onChange={e => editDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, action.id] : draft.permissions.filter(id => id !== action.id) })} />{action.label}</label>)}</fieldset>
            <button className="primary" disabled={locked || !draft.permissions.length} onClick={async () => { if (await post("/draft", draft, true)) { setContinued(true); setStep(1); } }}>Save draft and continue</button>
            <div className="fine" style={{ marginTop: 12 }}>Draft only · not signed. Sign at enforcement.</div>
          </>}
          {step === 1 && <>
            <span className="kicker">McBain · analyst workspace</span><h1 id="screen-title">Chat with Atlas.</h1>
            <div className="messages" role="log" aria-label="Conversation">
              {!currentConversation.length && <div className="empty-state">Ask a question. Attach your own document.</div>}
              {currentConversation.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(conversation => <div key={conversation.id}>
                <div className="messages">
                  <article className="bubble"><span className="kicker">You</span><pre>{conversation.task}</pre>{conversation.report && <details><summary>{conversation.report.fileName}</summary><pre className="untrusted">{conversation.report.text}</pre></details>}</article>
                  <article className="bubble atlas"><span className="kicker">Atlas</span><pre>{conversation.transcript || (conversation.status === "pending" ? "Response pending." : conversation.status === "unknown" ? "Outcome unknown. Check status in options." : "No written response returned.")}</pre></article>
                </div>
                <details><summary>Request options</summary><button disabled={locked} onClick={() => { setLastRequest({ task: conversation.task, report: conversation.report }); setRun(null); setStep(2); }}>Use this request for enforcement</button></details>
              </div>)}
            </div>
            <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
              <label className="sr-only" htmlFor="task">Message Atlas</label>
              <textarea id="task" maxLength={4000} value={draft.task} disabled={locked} placeholder="Message Atlas…" onChange={e => editDraft({ ...draft, task: e.target.value })} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
              <input ref={fileInput} hidden type="file" accept={ACCEPT} disabled={locked} aria-label="Attach report" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
              {draft.report && <div className="attachment"><div className="row"><strong>{draft.report.fileName}</strong><button type="button" disabled={locked} onClick={() => { editDraft({ ...draft, report: null }); setParts([]); }}>Remove attachment</button></div><details><summary>Preview extracted report</summary><div className="fine">Untrusted text · hidden content included</div><div className="untrusted">{parts.length ? parts.map((part, i) => <div key={i}>{part.hidden && <strong>Hidden text · untrusted</strong>}<pre>{part.text}</pre></div>) : <pre>{draft.report.text}</pre>}</div></details></div>}
              <div className="row"><button type="button" disabled={locked} onClick={() => fileInput.current?.click()}>Attach document</button><button className="primary" type="submit" disabled={locked || !data.availability.chat || !draft.task.trim()}>Send message</button></div>
            </form>
            {uploading && <div role="status" className="fine">Extracting document…</div>}
            {uploadError && <div role="alert" className="notice error-notice">{uploadError}</div>}
            {!data.availability.chat && <div className="notice">Chat unavailable. Refresh status to retry.</div>}
            <div className="fine">Enter to send · Shift+Enter for a new line · no Monad transaction</div>
            {lastRequest && <button className="primary" disabled={locked} style={{ marginTop: 20 }} onClick={() => setStep(2)}>Continue to Monad enforcement</button>}
          </>}
          {step === 2 && <>
            <span className="kicker">Monad · bouncer</span><h1 id="screen-title">Enforce the permission slip.</h1>
            {lastRequest && <details className="sheet"><summary>Request to enforce</summary><pre>{lastRequest.task}</pre>{lastRequest.report && <><strong>{lastRequest.report.fileName}</strong><pre className="untrusted">{lastRequest.report.text}</pre></>}</details>}
            <div className="fine">Selected scope: {draft.permissions.map(actionLabel).join(", ") || "None"}</div>
            {paused && <div role="status" className="notice">Chain paused. Chat is still available.</div>}
            {!matchingSlip ? <><div className="fine">No matching signed permission slip.</div><button className="primary" disabled={locked || paused || !data.availability.signing || !draft.permissions.length} onClick={() => void post("/sign", { permissions: draft.permissions })}>Sign selected permissions</button></> :
              <><div className="fine">Matching signed permission slip ready.</div><button className="primary" disabled={locked || paused || !data.availability.agent || !lastRequest} onClick={async () => {
                if (!lastRequest) return;
                const input = { ...lastRequest, permissionId: matchingSlip.mandate.mandateId };
                setRun({ ...input, previous: data.conversations.map(item => item.id) });
                await post("/run", input);
              }}>Run Atlas</button></>}
            {(!matchingSlip && !data.availability.signing) || !data.availability.agent ? <details className="notice"><summary>Enforcement unavailable</summary><div className="fine">{data.availability.detail}</div></details> : null}
            {run && !result && <div role="status" className="notice">No matched result recorded. Check status before another run.</div>}
            {result && <><h2>Request result · {result.status}</h2>{result.transcript && <pre>{result.transcript}</pre>}{!receipts.length && <div className="notice">No access receipt recorded for this request.</div>}{receipts.map(receipt => <ReceiptDetail key={receipt.id} receipt={receipt} />)}</>}
            <button style={{ marginTop: 16 }} disabled={locked} onClick={() => setStep(1)}>Back to chat</button>
          </>}
        </section>
        <details className="workspace-options"><summary>History &amp; workspace options</summary>
          <details><summary>Previous conversations</summary>{data.conversations.filter(item => previousConversationIds.current?.has(item.id)).map(item => <article className="sheet" key={item.id}><p>{item.task}</p>{item.report && <details><summary>{item.report.fileName}</summary><pre className="untrusted">{item.report.text}</pre></details>}<pre>{item.transcript}</pre></article>)}</details>
          {paused && <div className="notice">Spending paused.<details><summary>Why?</summary><div className="fine">{uncertain ? "Workspace status is unavailable. Refresh status before spending." : "An operation is pending or unknown. Check its status; do not repeat it."}</div></details></div>}
          <h2>Operations</h2>
          {!data.operations.length && <div className="fine">No operations yet.</div>}
          {data.operations.map(operation => <details className="sheet" key={operation.id}><summary>{operation.kind} · {operation.status}</summary><div className="fine">{operation.detail}</div><button disabled={locked} onClick={() => void post("/reconcile", { operationId: operation.id })}>Check status</button></details>)}
          <details><summary>Permission history</summary><SlipHistory slips={data.slips} /></details>
          <details><summary>Access receipt history · {data.receipts.length}</summary>{data.receipts.map(receipt => <ReceiptDetail key={receipt.id} receipt={receipt} />)}</details>
          <details><summary>Document &amp; workspace limits</summary><div className="fine">Word (.docx), text, Markdown or HTML · up to 5 MB / 60,000 extracted characters. All extracted text is untrusted input. Goldman Stanley and McBain are fictional. Do not upload confidential or personal information. Anonymous browser-cookie workspace; content expires after 30 days. Public records remain. Chat: 20 messages per workspace daily, 200 shared.</div></details>
          {resetConfirm ? <div className="notice">Clear workspace? Public records remain. Quota is not renewed.<div className="row"><button className="danger" disabled={locked || paused} onClick={async () => { if (await post("/reset", {}, true)) { setStep(0); setContinued(false); setLastRequest(null); setRun(null); setParts([]); setResetConfirm(false); } }}>Confirm reset</button><button disabled={locked} onClick={() => setResetConfirm(false)}>Cancel</button></div></div> : <button className="danger" disabled={locked || paused} onClick={() => setResetConfirm(true)}>Reset workspace</button>}
        </details>
      </>}
    </main>
  </div>;
}
