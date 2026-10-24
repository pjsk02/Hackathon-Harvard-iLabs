import { useEffect, useRef, useState } from "react";
import { ACTIONS, actionLabel, type Conversation } from "@shared/workspace";
import type { UploadedReport } from "@shared/contract";
import { ACCEPT, readUpload, type Part } from "./upload";
import { useWorkspace } from "./use-workspace";
import { ReceiptDetail, SlipHistory } from "./WorkspaceEvidence";
import { ChatEnforcement } from "./ChatEnforcement";
import { ServiceStatus } from "./ServiceStatus";
import "./workspace.css";
import { AtlasReply } from "./AtlasReply";
import "./atlas-reply.css";

type RequestInput = { task: string; report: UploadedReport | null };
const QUICK_PROMPTS = ["Complete the request", "Verify this request", "Summarize this document"];

export default function SplitApp() {
  const { data, draft, editDraft, busy, error, uncertain, reload, post } = useWorkspace();
  const [step, setStep] = useState(new URLSearchParams(location.search).has("case") ? 1 : 0);
  const [continued, setContinued] = useState(new URLSearchParams(location.search).has("case"));
  const [parts, setParts] = useState<Part[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<RequestInput | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [mode,setMode] = useState<"enforced"|"document">("enforced");
  const [resetConfirm, setResetConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const previousConversationIds = useRef<Set<string> | null>(null);
  if (data && !previousConversationIds.current) previousConversationIds.current = new Set(data.conversations.map(item => item.id));
  const caseView = new URLSearchParams(location.search).has("case");
  const currentConversation = data?.conversations.filter(item => caseView && data.currentTransaction ? data.currentTransaction.conversationIds.includes(item.id) : !previousConversationIds.current?.has(item.id)) ?? [];
  const locked = busy || uploading || data?.currentTransaction?.status === "done";
  const unresolved = data?.operations.filter(op => !["complete", "completed", "confirmed", "recorded", "succeeded", "failed", "resolved", "cancelled"].includes(op.status)) ?? [];
  const paused = uncertain || unresolved.length > 0;
  const matchingSlip = data?.slips.slice().reverse().find(slip =>
    !!slip.signature && !!slip.anchor && slip.mandate.agentId === "atlas-research-agent" &&
    slip.mandate.issuedAt * 1000 <= Date.now() && slip.mandate.expiresAt * 1000 > Date.now() &&
    slip.mandate.allowedActions.length === draft.permissions.length &&
    draft.permissions.every(action => slip.mandate.allowedActions.includes(action)));
  const result = data?.conversations.find(item=>item.id===selectedRequest);
  const canSend=mode==="document" ? !!data?.availability.chat : !!data?.availability.agent && (!!matchingSlip || !!data?.availability.signing);
  const receipts = result ? data?.receipts.filter(receipt => result.receiptIds.includes(receipt.id) &&
    receipt.mandateId === result.permissionId && receipt.source === "agent") ?? [] : [];

  function viewRequest(conversation: Conversation) {
    const input = { task: conversation.task, report: conversation.report };
    setLastRequest(input);
    setSelectedRequest(conversation.id);
    setStep(2);
  }

  const resumed = useRef(false);
  useEffect(() => {
    if (!caseView || !data?.currentTransaction || resumed.current) return;
    resumed.current = true;
    const prior = data.conversations.filter(item => data.currentTransaction!.conversationIds.includes(item.id)).at(-1);
    if (prior) {setLastRequest({ task: prior.task, report: prior.report });setSelectedRequest(prior.id);}
  }, [caseView, data]);

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
    if (locked || paused || !draft.task.trim() || !canSend) return;
    const input = { task: draft.task, report: draft.report };
    const saved=await post("/submit",{...input,mode,permissions:draft.permissions,historyIds:currentConversation.slice(-8).map(item=>item.id)});
    if(saved){
      setLastRequest(input);
      setSelectedRequest(saved.submissionId ?? saved.conversations?.at(-1)?.id ?? null);
      editDraft({ ...draft, task:"",report:null });setParts([]);
    }
  }

  return <div className="workspace">
    <header className="workspace-header">
      <div className="workspace-brand"><img src="/envoi-logo.png" alt="" /><span>Envoi</span></div>
      <div className="row"><a href="/#transactions">← Transaction board</a><button disabled={busy} onClick={() => void reload()}>Refresh status</button></div>
    </header>
    <main>
      <nav aria-label="Workspace steps"><ol className="step-progress">
        {["Permissions", "Chat", "Monad result"].map((label, i) => <li key={label}><button aria-current={step === i ? "step" : undefined} disabled={busy || uploading || (i === 1 && !continued) || (i === 2 && !lastRequest)} onClick={() => setStep(i)}>{i + 1} · {label}</button></li>)}
      </ol></nav>
      {!data ? <section className="workspace-panel"><h1>Opening workspace</h1>{error ? <div role="alert" className="notice error-notice">{error}<button onClick={() => void reload()}>Retry loading</button></div> : <div role="status" aria-label="Loading workspace"><div className="skeleton" /><div className="skeleton" /></div>}</section> : <>
        {error && <div role="alert" className="notice error-notice">{error}</div>}
        {data.currentTransaction && <div className="fine case-context">Transaction: {data.currentTransaction.title}{data.currentTransaction.status === "done" && " · Done. Reopen it on the board to add activity."}</div>}
        {busy && <div role="status" className="fine">Checking with Envoi…</div>}
        <section className="workspace-panel" aria-labelledby="screen-title">
          {step === 0 && <>
            <span className="kicker">Goldman Stanley · data owner</span><h1 id="screen-title">Set Atlas’s permissions.</h1>
            <fieldset disabled={locked}><legend>Allow Atlas to read</legend>{ACTIONS.map(action => <label className="permission-option" key={action.id}><input type="checkbox" checked={draft.permissions.includes(action.id)} onChange={e => editDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, action.id] : draft.permissions.filter(id => id !== action.id) })} />{action.label}</label>)}</fieldset>
            <button className="primary" disabled={locked || !draft.permissions.length} onClick={async () => { if (await post("/draft", draft, true)) { setContinued(true); setStep(1); } }}>Save draft and continue</button>
            <div className="fine" style={{ marginTop: 12 }}>Draft only · selected permissions are signed when you send an enforced request, if needed and recording is enabled.</div>
          </>}
          {step === 1 && <>
            <span className="kicker">McBain · analyst workspace</span><h1 id="screen-title">Chat with Atlas.</h1>
            <div className="messages" role="log" aria-label="Conversation">
              {!currentConversation.length && <div className="empty-state">Ask a question. Attach your own document.</div>}
              {currentConversation.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(conversation => <div key={conversation.id}>
                <div className="messages">
                  <article className="bubble"><span className="kicker">You</span><pre>{conversation.task}</pre>{conversation.report && <details><summary>{conversation.report.fileName}</summary><pre className="untrusted">{conversation.report.text}</pre></details>}</article>
                  <article className="bubble atlas"><span className="kicker">Atlas</span>
                    <ChatEnforcement message={conversation} conversations={data.currentTransaction ? data.conversations.filter(item=>data.currentTransaction!.conversationIds.includes(item.id)) : data.conversations} receipts={data.receipts} disabled={busy} onView={viewRequest} />
                    <AtlasReply text={conversation.transcript || (conversation.status === "pending" ? "Response pending." : conversation.status === "unknown" ? "Outcome unknown. Check status in options." : "No written response returned.")} /></article>
                </div>
              </div>)}
            </div>
            <fieldset className="request-mode" disabled={locked}><legend>Request handling</legend><label><input type="radio" name="mode" value="enforced" checked={mode==="enforced"} onChange={()=>setMode("enforced")} /> Enforce permissions</label><label><input type="radio" name="mode" value="document" checked={mode==="document"} onChange={()=>setMode("document")} /> Document chat only</label></fieldset>
            <div className="permission-summary"><span className="fine">Selected permissions: {draft.permissions.map(actionLabel).join(", ") || "None"}</span><button disabled={locked} onClick={()=>setStep(0)}>Edit permissions</button></div>
            <p className="fine">{mode==="enforced" ? matchingSlip ? "Send message reuses your signed permission and checks every proposed data action. Scope violations use an available approved recording slot." : "Send message signs and stamps your selected permissions, then checks every proposed data action. Signing requires an approved recording allowance." : "Document-only analysis uses your attachment and conversation. It does not access protected company data, sign permissions, or submit a Monad transaction."}</p>
            <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
              <label className="sr-only" htmlFor="task">Message Atlas</label>
              <textarea ref={messageInput} id="task" maxLength={4000} value={draft.task} disabled={locked} placeholder="Message Atlas…" onChange={e => editDraft({ ...draft, task: e.target.value })} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
              <input ref={fileInput} hidden type="file" accept={ACCEPT} disabled={locked} aria-label="Attach report" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} />
              {draft.report && <div className="attachment"><div className="row"><strong>{draft.report.fileName}</strong><button type="button" disabled={locked} onClick={() => { editDraft({ ...draft, report: null }); setParts([]); }}>Remove attachment</button></div><details><summary>Preview extracted report</summary><div className="fine">Untrusted text · hidden content included</div><div className="untrusted">{parts.length ? parts.map((part, i) => <div key={i}>{part.hidden && <strong>Hidden text · untrusted</strong>}<pre>{part.text}</pre></div>) : <pre>{draft.report.text}</pre>}</div></details></div>}
              <div className="quick-prompts" role="group" aria-label="Quick prompts">
                {QUICK_PROMPTS.map(prompt => <button key={prompt} type="button" disabled={locked} aria-controls="task" onClick={() => {
                  editDraft({ ...draft, task: prompt });
                  setMode(prompt === "Summarize this document" ? "document" : "enforced");
                  messageInput.current?.focus();
                }}>{prompt}</button>)}
              </div>
              <div className="row"><button type="button" disabled={locked} onClick={() => fileInput.current?.click()}>Attach document</button><button className="primary" type="submit" disabled={locked || paused || !canSend || !draft.task.trim() || !draft.permissions.length}>Send message</button></div>
            </form>
            {uploading && <div role="status" className="fine">Extracting document…</div>}
            {uploadError && <div role="alert" className="notice error-notice">{uploadError}</div>}
            {!canSend && <div className="notice" role="status">{mode==="enforced" ? "Enforced requests are unavailable. Configure signing and AI, and approve the required bounded allowances. No new request has been sent from this composer." : "Document chat is unavailable. Configure Anthropic and refresh status."}</div>}
            {paused && <div className="notice" role="status">An outcome is uncertain. Check the original operation in workspace options before sending another request.</div>}
            <div className="fine">Enter to send · Shift+Enter for a new line · {mode==="enforced" ? "permission checks run with your message" : "document-only chat · no Monad transaction"}</div>
            {lastRequest && <button className="primary" disabled={locked} style={{ marginTop: 20 }} onClick={() => setStep(2)}>View latest request result</button>}
          </>}
          {step === 2 && <>
            <span className="kicker">Monad · saved evidence</span><h1 id="screen-title">Request result.</h1>
            <p className="fine">This page reads the saved outcome. Signing and permission enforcement happen when you send from chat; viewing results never repeats a request.</p>
            {result ? <><h2>{result.mode==="document" ? "Document chat" : result.permissionId ? "Permissioned request" : "Request"} · {result.status}</h2><details className="sheet"><summary>Original request</summary><pre>{result.task}</pre>{result.report&&<><strong>{result.report.fileName}</strong><pre className="untrusted">{result.report.text}</pre></>}</details>{result.enforcement&&<p className="notice">{result.enforcement.detail}</p>}{result.transcript&&<AtlasReply text={result.transcript}/>}<p className="fine">{result.mode==="document" ? "Document chat only. No protected-data access or Monad request record." : !receipts.length ? "No access receipt recorded for this request. No successful enforcement is claimed." : "Access decisions and public recording are shown separately below."}</p>{receipts.map(receipt=><ReceiptDetail key={receipt.id} receipt={receipt}/>)}</> : <p className="notice">No saved result selected. Open a request from chat or history; nothing was repeated.</p>}
            <button style={{ marginTop: 16 }} disabled={locked} onClick={() => setStep(1)}>Back to chat</button>
          </>}
        </section>
        <details className="workspace-options"><summary>History &amp; workspace options</summary>
          <details><summary>Previous conversations</summary>{data.conversations.filter(item => previousConversationIds.current?.has(item.id) && !(caseView && data.currentTransaction?.conversationIds.includes(item.id))).map(item => <article className="sheet" key={item.id}><p>{item.task}</p>{item.report && <details><summary>{item.report.fileName}</summary><pre className="untrusted">{item.report.text}</pre></details>}<AtlasReply text={item.transcript} /><button onClick={() => viewRequest(item)}>View request result</button></article>)}</details>
          {paused && <div className="notice">Spending paused.<details><summary>Why?</summary><div className="fine">{uncertain ? "Workspace status is unavailable. Refresh status before spending." : "An operation is pending or unknown. Check its status; do not repeat it."}</div></details></div>}
          <ServiceStatus />
          <h2>Operations</h2>
          {!data.operations.length && <div className="fine">No operations yet.</div>}
          {data.operations.map(operation => <details className="sheet" key={operation.id}><summary>{operation.kind} · {operation.status}</summary><div className="fine">{operation.detail}</div><button disabled={locked} onClick={() => void post("/reconcile", { operationId: operation.id })}>Check status</button></details>)}
          <details><summary>Permission history</summary><SlipHistory slips={data.slips} /></details>
          <details><summary>Access receipt history · {data.receipts.length}</summary>{data.receipts.map(receipt => <ReceiptDetail key={receipt.id} receipt={receipt} />)}</details>
          <details><summary>Document &amp; workspace limits</summary><div className="fine">Word (.docx), text, Markdown or HTML · up to 5 MB / 60,000 extracted characters. All extracted text is untrusted input. Goldman Stanley and McBain are fictional. Do not upload confidential or personal information. Anonymous browser-cookie workspace; content expires after 30 days. Public records remain. Chat: 20 messages per workspace daily, 200 shared.</div></details>
          {resetConfirm ? <div className="notice">Clear all private transactions, conversations, reports and permissions in this browser workspace? Public records remain. Quota is not renewed.<div className="row"><button className="danger" disabled={locked || paused} onClick={async () => { if (await post("/reset", {}, true)) { setStep(0); setContinued(false); setLastRequest(null); setSelectedRequest(null); setParts([]); setResetConfirm(false); } }}>Confirm reset</button><button disabled={locked} onClick={() => setResetConfirm(false)}>Cancel</button></div></div> : <button className="danger" disabled={locked || paused} onClick={() => setResetConfirm(true)}>Reset workspace</button>}
        </details>
      </>}
    </main>
  </div>;
}
