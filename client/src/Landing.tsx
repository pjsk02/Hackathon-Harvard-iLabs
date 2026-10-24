import { useCallback, useEffect, useRef, useState } from "react";
import { CASE_SCENARIO, CASE_STATUS, type BoardResponse, type CaseDetail, type CaseScenario, type CaseStatus } from "@shared/transactions";
import { workspaceRequest } from "./split/use-workspace";
import { announceBoardChange } from "./board-events";
import "./landing.css";

function FlowArt() {
  return <svg className="flow-art" viewBox="0 0 1000 650" fill="none" aria-hidden="true"><defs><linearGradient id="flow-fade" gradientUnits="userSpaceOnUse" x1="0" x2="1000"><stop stopColor="#ddd" stopOpacity=".04"/><stop offset=".5" stopColor="#ddd" stopOpacity=".6"/><stop offset="1" stopColor="#ddd" stopOpacity=".04"/></linearGradient></defs>
    {Array.from({length:25},(_,i)=>{const y=40+i*23;return <path key={i} d={`M -80 ${y} C 245 ${y-75}, 355 ${325+(y-325)*.07}, 500 ${325+(y-325)*.07} S 755 ${650-y+75},1080 ${650-y}`} stroke="url(#flow-fade)" strokeWidth=".7"/>;})}
  </svg>;
}
export default function Landing() {
  const [board,setBoard]=useState<BoardResponse|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<"all"|CaseScenario>("all");
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<CaseDetail|null>(null);
  const [detailError,setDetailError]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [title,setTitle]=useState("");
  const [busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const detailGeneration=useRef(0), boardGeneration=useRef(0);
  const createKey=useRef(crypto.randomUUID());
  const selectedRef=useRef(selected); selectedRef.current=selected;
  const getDetail=useCallback(async(id:string)=>{
    const generation=++detailGeneration.current;
    try { const next=await workspaceRequest(`/transactions/${encodeURIComponent(id)}`) as CaseDetail; if(generation===detailGeneration.current){setDetail(next);setDetailError(null);} }
    catch(e){if(generation===detailGeneration.current) {setDetail(null);setDetailError((e as Error).message);}}
  },[]);
  const refresh=useCallback(async()=>{
    const generation=++boardGeneration.current;
    try {
      const next=await workspaceRequest("/transactions") as BoardResponse;
      if(generation!==boardGeneration.current)return;
      setBoard(next);setError(null);
      if(selectedRef.current)void getDetail(selectedRef.current);
    } catch(e){if(generation===boardGeneration.current)setError((e as Error).message);}
    finally{if(generation===boardGeneration.current)setLoading(false);}
  },[getDetail]);
  useEffect(()=>{
    void refresh();
    const visible=()=>{if(document.visibilityState==="visible")void refresh();};
    const focus=()=>void refresh();
    const storage=(event:StorageEvent)=>{if(event.key==="envoi-board-change")void refresh();};
    window.addEventListener("focus",focus);window.addEventListener("pageshow",focus);
    document.addEventListener("visibilitychange",visible);window.addEventListener("storage",storage);window.addEventListener("envoi-board-change",focus);
    return()=>{boardGeneration.current++;detailGeneration.current++;window.removeEventListener("focus",focus);window.removeEventListener("pageshow",focus);document.removeEventListener("visibilitychange",visible);window.removeEventListener("storage",storage);window.removeEventListener("envoi-board-change",focus);};
  },[refresh]);
  useEffect(()=>{
    if(!selected)return;
    setDetail(null);setDetailError(null);void getDetail(selected);
    dialog.current?.showModal();
    return()=>{detailGeneration.current++;};
  },[selected,getDetail]);
  function close(){dialog.current?.close();setSelected(null);document.getElementById(`case-${selected}`)?.focus();}
  async function create(event:React.FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);setError(null);
    try {
      // Reuse this identifier on uncertain retries; never create a second logical case.
      const response=await fetch("/api/workspace/transactions",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Idempotency-Key":createKey.current},body:JSON.stringify({title})});
      const next=await response.json();if(!response.ok)throw new Error(next.error ?? "Could not create the transaction.");
      announceBoardChange();window.location.assign(`/workspace?case=${encodeURIComponent(next.createdId)}`);
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  async function changeStatus(){
    if(!detail||busy)return;setBusy(true);setDetailError(null);
    try{const next=await workspaceRequest(`/transactions/${encodeURIComponent(detail.id)}/status`,{status:detail.status==="done"?"in_progress":"done",revision:detail.revision}) as CaseDetail;setDetail(next);announceBoardChange();await refresh();}
    catch(e){setDetailError((e as Error).message);}finally{setBusy(false);}
  }
  const workspaceHref=board?.activeId ? `/workspace?case=${encodeURIComponent(board.activeId)}` : "/workspace";
  return <div className="home">
    <a className="home-skip" href="#transactions">Skip to transaction board</a>
    <header className="home-nav"><a className="home-brand" href="/" aria-label="Envoi home"><img src="/envoi-logo.png" alt=""/>Envoi<span className="home-beta">EVALUATION</span></a><nav aria-label="Main"><a href="#transactions">Transactions</a><a className="home-pill small-pill" href={workspaceHref}>Open workspace <span aria-hidden="true">↗</span></a></nav></header>
    <main>
      <section className="home-hero" aria-labelledby="hero-title">
        <FlowArt/><div className="hero-content"><p className="home-eyebrow"><span/> PERMISSION BEFORE ACCESS</p><h1 id="hero-title">Give agents permission.<br/><span>Keep control of every action.</span></h1><p className="hero-description">A clear boundary for AI. A lasting record for you.<br/>Define what’s allowed, work with Atlas, and follow the evidence.</p><div className="hero-actions"><a className="home-pill solid-pill" href={workspaceHref}>Open workspace <span aria-hidden="true">↗</span></a><a className="home-pill" href="#transactions">View transactions <span aria-hidden="true">↓</span></a></div></div>
        <div className="capability-row" aria-label="Product capabilities"><span>01 <b>Scoped permissions</b></span><span>02 <b>Deterministic access checks</b></span><span>03 <b>Evidence on Monad testnet</b></span></div>
      </section>
      <section className="transaction-section" id="transactions" aria-labelledby="board-title">
        <div className="board-heading"><div><p className="home-eyebrow">YOUR WORK, IN VIEW</p><h2 id="board-title">The transaction room.</h2><p>One case. Every conversation. A traceable history.</p></div><button className="home-pill solid-pill" disabled={!board||busy} onClick={()=>{setCreating(true);setTitle("");createKey.current=crypto.randomUUID();}}>+ New transaction</button></div>
        <div className="board-toolbar"><label>Scenario <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All scenarios</option><option value="consulting">Permissioned data review</option><option value="chargeback">Chargeback evidence review</option></select></label><button className="quiet-button" onClick={()=>void refresh()} disabled={busy}>Refresh board ↻</button></div>
        <p className="board-note">Private to this browser’s workspace · test cases are illustrative · business status is separate from access decisions.</p>
        {creating&&<form className="create-case" onSubmit={create}><label htmlFor="case-title">Name your transaction</label><div><input id="case-title" autoFocus maxLength={100} required value={title} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Quarterly data review"/><button className="home-pill solid-pill" disabled={busy||!title.trim()}>Create & open workspace</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button></div><p>Creates a private data-review case. Existing conversations and public records stay in place.</p></form>}
        {error&&<div className="board-error" role="alert">{error} <button onClick={()=>void refresh()}>Try again</button></div>}
        {loading&&!board?<p role="status" className="board-loading">Opening your transaction room…</p>:board?<div className="kanban">{(["open","in_progress","done"] as CaseStatus[]).map(status=>{
          const cases=board.cases.filter(item=>item.status===status&&(filter==="all"||filter===item.scenario));
          return <section className={`kanban-column stage-${status}`} key={status} aria-label={`${CASE_STATUS[status]} transactions`}><h3><span className="stage-dot"/>{CASE_STATUS[status]}<span className="column-count">{cases.length}</span></h3><div className="column-body">{cases.length?cases.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(item=><button className="case-card" key={item.id} id={`case-${item.id}`} onClick={()=>setSelected(item.id)}><div className="case-topline"><span>{CASE_SCENARIO[item.scenario]}</span><span aria-hidden="true">↗</span></div><h4>{item.title}</h4><p>{item.parties}</p><div className="card-badges">{item.provenance==="example"?<span className="example-badge">Test case · synthetic</span>:<span className="private-badge">Your workspace</span>}{item.pending&&<span>Outcome unresolved</span>}{item.decisions.map(decision=><span key={decision}>{decision}</span>)}</div><div className="case-footer"><span>{item.provenance==="example"?"Illustrative workflow":"Last activity"}</span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time></div></button>):<div className="empty-column"><span aria-hidden="true">{status==="open"?"＋":"—"}</span><p>{status==="open"?"Your next review starts here.":status==="in_progress"?"Nothing in progress.":"Completed work will live here."}</p>{status==="open"&&<button onClick={()=>{setCreating(true);createKey.current=crypto.randomUUID();}}>Create a transaction</button>}</div>}</div></section>;
        })}</div>:<p className="board-loading">The homepage is available. Your private board needs working workspace storage.</p>}
      </section>
    </main>
    <footer className="home-footer"><span className="home-brand">Envoi</span><p>Permission before access. Evidence after every request.</p><span>Fictional evaluation data · Monad testnet</span></footer>
    <dialog ref={dialog} className="case-dialog" aria-labelledby="case-detail-title" onCancel={close} onClose={()=>{if(selected)setSelected(null);}}>
      <div className="dialog-top"><span className="home-eyebrow">TRANSACTION DETAILS</span><button aria-label="Close transaction details" className="quiet-button" onClick={close}>✕</button></div>
      {detail?<><div className="detail-badges"><span>{CASE_STATUS[detail.status]}</span>{detail.provenance==="example"&&<span className="example-badge">Test case · synthetic</span>}</div><h2 id="case-detail-title">{detail.title}</h2><p className="detail-parties">{detail.parties}</p>
        {detail.provenance==="example"?<p className="detail-notice">Illustrative workflow only. No live integration, agent output, bank decision or public-record verification is claimed.</p>:<><p className="detail-notice">{detail.pending?"An operation is pending or unresolved. Check its status in the workspace before changing this case.":"Business completion is your decision. Access decisions and public-record status are shown separately."}</p><div className="detail-actions"><a className="home-pill solid-pill" href={`/workspace?case=${encodeURIComponent(detail.id)}`}>Open conversation <span aria-hidden="true">↗</span></a><button className="home-pill" disabled={busy||detail.pending} onClick={()=>void changeStatus()}>{detail.status==="done"?"Reopen transaction":"Mark done"}</button></div></>}
        {detail.checklist.length>0&&<section><h3>Illustrative checklist</h3><ul className="detail-checklist">{detail.checklist.map(item=><li key={item}>{item}</li>)}</ul></section>}
        <section><h3>Activity timeline</h3><ol className="case-timeline">{detail.timeline.map((item,i)=><li key={i}><time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time><strong>{item.title}</strong><p>{item.detail}</p></li>)}</ol></section>
        <section><h3>Public records</h3>{!detail.records.length?<p className="detail-muted">No public-record links available for this case.</p>:detail.records.map((record,i)=><a key={i} className="record-link" href={record.url} target="_blank" rel="noopener noreferrer">{record.kind==="permission"?"Permission record":"Request record"} · {record.reference} ↗</a>)}</section>
      </>:<><h2 id="case-detail-title">Transaction details</h2>{!detailError&&<p role="status">Loading saved activity…</p>}</>}
      {detailError&&<p className="board-error" role="alert">{detailError}</p>}
    </dialog>
  </div>;
}
