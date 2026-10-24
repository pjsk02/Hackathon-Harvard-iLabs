import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import express from "express";
import { pool,freshDocument,load,inWorkspace,reserve,checkpoint,finish,hash } from "./repository";
import { boardWorkspace,listCases,caseDetail,mutateCase } from "./transactions";
import { createWorkspaceRouter } from "../routes/workspace";
import { errorHandler } from "../http";
import type { Workspace } from "./repository";
import { attemptFingerprint } from "../../shared/attempt-record";
import type { Slip, Receipt, AttemptRecord } from "../../shared/contract";
import { serviceDiagnostics } from "../workspace-diagnostics";

const ids:string[]=[];
async function fixture(doc=freshDocument()){
  const id=randomUUID(), token=randomBytes(32).toString("hex");ids.push(id);
  await pool.query("INSERT INTO envoi_workspaces(id,capability_hash,document) VALUES($1,$2,$3)",[id,hash(token),JSON.stringify(doc)]);
  return {w:await load(id),token};
}
after(async()=>{for(const id of ids){await pool.query("DELETE FROM envoi_operations WHERE workspace_id=$1",[id]);await pool.query("DELETE FROM envoi_workspaces WHERE id=$1",[id]);}await pool.end();});

test("exactly two illustrative seeds persist once, and summaries never copy private histories",async()=>{
  const doc=freshDocument();doc.conversations.push({id:randomUUID(),task:"PRIVATE TASK",report:{fileName:"PRIVATE FILE",text:"PRIVATE REPORT"},permissionId:"",createdAt:new Date().toISOString(),transcript:"PRIVATE ANSWER",receiptIds:[],status:"complete"});
  const {w}=await fixture(doc);
  const first=await listCases(await boardWorkspace(w.id)), second=await listCases(await boardWorkspace(w.id));
  assert.equal(first.cases.filter(c=>c.provenance==="example").length,2);
  assert.deepEqual(first.cases.map(c=>c.id),second.cases.map(c=>c.id));
  assert.equal(first.cases.filter(c=>c.provenance==="workspace").length,1);
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE/);
  for(const item of first.cases.filter(c=>c.provenance==="example")){
    const detail=await caseDetail(await boardWorkspace(w.id),item.id);assert.equal(detail.records.length,0);assert.equal(detail.conversationCount,0);assert.match(detail.timeline[0].detail,/fictional/i);
  }
  const draftOnly=freshDocument();draftOnly.draft.task="An earlier saved draft";draftOnly.draft.report={fileName:"draft.txt",text:"Earlier draft text"};
  const draftWorkspace=await fixture(draftOnly),imported=await boardWorkspace(draftWorkspace.w.id);
  assert.equal(imported.document.board!.cases.filter(c=>c.provenance==="workspace").length,1);
  const draftCase=imported.document.board!.cases.find(c=>c.provenance==="workspace")!;
  assert.equal(draftCase.status,"open");assert.deepEqual(draftCase.draft,draftOnly.draft);
});
test("new transactions retain prior cases; same-key creates are idempotent and owned IDs stay isolated",async()=>{
  const a=await fixture(),b=await fixture();const id=randomUUID();
  const created=await mutateCase(a.w.id,id,{action:"create",title:"My review"});
  assert.equal((await caseDetail(created,id)).status,"open");
  await mutateCase(a.w.id,id,{action:"create",title:"My review"});
  await mutateCase(a.w.id,randomUUID(),{action:"create",title:"Another review"});
  assert.equal((await listCases(await boardWorkspace(a.w.id))).cases.length,4);
  await assert.rejects(mutateCase(a.w.id,id,{action:"create",title:"Changed"}),/already belongs/);
  await assert.rejects(caseDetail(await boardWorkspace(b.w.id),id),/does not belong/);
  await assert.rejects(mutateCase(b.w.id,id,{action:"status",status:"done",revision:0}),/does not belong/);
  await pool.query("UPDATE envoi_workspaces SET expires_at=now()-interval '1 second' WHERE id=$1",[b.w.id]);
  await assert.rejects(boardWorkspace(b.w.id),/expired/);
});
test("operations group under their original case before execution, and unknown work cannot be reassigned or completed",async()=>{
  const {w}=await fixture();const first=randomUUID(),second=randomUUID();
  await mutateCase(w.id,first,{action:"create",title:"First review"});
  await mutateCase(w.id,second,{action:"create",title:"Second review"});
  const active=await load(w.id),op=await inWorkspace(active,()=>reserve(randomUUID(),"chat",{task:"PRIVATE"},first));
  let saved=await load(w.id);assert.ok(saved.document.board!.cases.find(c=>c.id===first)!.operationIds.includes(op.id));
  assert.equal(saved.document.board!.cases.find(c=>c.id===second)!.operationIds.length,0);
  assert.equal((await caseDetail(saved,first)).status,"in_progress");
  await assert.rejects(mutateCase(w.id,first,{action:"status",status:"done",revision:1}),/unresolved/);
  await assert.rejects(mutateCase(w.id,randomUUID(),{action:"create",title:"Cannot move pending work"}),/unresolved/);
  await assert.rejects(inWorkspace(await load(w.id),()=>reserve(randomUUID(),"chat",{},second)),/unconfirmed/);
  await finish(active,op,"unknown","Provider outcome unknown.");
  saved=await load(w.id);assert.ok((await caseDetail(saved,first)).pending);
  // Explicit recovery owns the original operation; no provider is called here.
  await pool.query("UPDATE envoi_operations SET status='failed' WHERE id=$1",[op.id]);
  await pool.query("UPDATE envoi_workspaces SET active_operation=NULL WHERE id=$1",[w.id]);
  const again=await load(w.id);
  await inWorkspace(again,async()=>{
    const next=await reserve(randomUUID(),"chat",{task:"Second message"},first);
    again.document.conversations.push({id:next.id,task:"PRIVATE MESSAGE",report:null,permissionId:"",createdAt:new Date().toISOString(),transcript:"PRIVATE ANSWER",receiptIds:[],status:"complete"});
    await checkpoint(again,next);await finish(again,next,"complete","Saved.");
  });
  const detail=await caseDetail(await load(w.id),first);assert.equal(detail.conversationCount,1);assert.equal(detail.timeline.length,3);assert.doesNotMatch(JSON.stringify(detail),/PRIVATE/);
  assert.equal((await load(w.id)).document.board!.cases.find(c=>c.id===first)!.conversationIds.length,2);
});
test("business completion is explicit, revision checked, and concurrent status edits have one winner",async()=>{
  const {w}=await fixture(),id=randomUUID();await mutateCase(w.id,id,{action:"create",title:"Lifecycle"});
  const results=await Promise.allSettled([mutateCase(w.id,id,{action:"status",status:"done",revision:0}),mutateCase(w.id,id,{action:"status",status:"done",revision:0})]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await caseDetail(await load(w.id),id)).status,"done");
  await assert.rejects(inWorkspace(await load(w.id),()=>reserve(randomUUID(),"chat",{},id)),/Reopen/);
  await mutateCase(w.id,id,{action:"status",status:"in_progress",revision:1});
  assert.equal((await caseDetail(await load(w.id),id)).status,"in_progress");
});
test("board HTTP operations use the existing session and CSRF guard with zero provider calls or allowance changes",async()=>{
  const {w,token}=await fixture(),other=await fixture();let calls=0;
  const app=express();app.use(express.json());app.use(createWorkspaceRouter(async()=>{calls++;throw new Error("Must not run");},()=>false));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const before=(await pool.query("SELECT * FROM envoi_budgets ORDER BY kind")).rows;
  const headers={Cookie:`__Host-envoi=${token}`,Origin:base,"Content-Type":"application/json","Idempotency-Key":randomUUID()};
  try{
    assert.equal((await fetch(`${base}/api/workspace/transactions`,{headers})).status,200);
    const created=await fetch(`${base}/api/workspace/transactions`,{method:"POST",headers,body:JSON.stringify({title:"HTTP review"})});assert.equal(created.status,200);const id=(await created.json()).createdId;
    assert.equal((await fetch(`${base}/api/workspace/transactions/${id}`,{headers:{Cookie:`__Host-envoi=${other.token}`}})).status,404);
    assert.equal((await fetch(`${base}/api/workspace/transactions/${id}/status`,{method:"POST",headers:{...headers,Origin:"https://untrusted.invalid"},body:JSON.stringify({status:"done",revision:0})})).status,403);
    assert.equal((await fetch(`${base}/api/workspace?transactionId=${id}`,{headers})).status,200);
    assert.equal((await fetch(`${base}/api/workspace/transactions/${id}/status`,{method:"POST",headers,body:JSON.stringify({status:"done",revision:0})})).status,200);
    assert.equal(calls,0);assert.deepEqual((await pool.query("SELECT * FROM envoi_budgets ORDER BY kind")).rows,before);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("case drafts and document-chat context remain attached to the selected case across other active cases",async()=>{
  const {w,token}=await fixture(),first=randomUUID(),second=randomUUID();
  await mutateCase(w.id,first,{action:"create",title:"First"});await mutateCase(w.id,second,{action:"create",title:"Second"});
  const histories:string[][]=[];
  const app=express();app.use(express.json());app.use(createWorkspaceRouter(async(_task,_report,history)=>{histories.push(history.map(item=>item.id));return "**Offline answer**";},()=>true));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const send=async(path:string,body:unknown)=>{const response=await fetch(`${base}/api/workspace${path}`,{method:"POST",headers:{Cookie:`__Host-envoi=${token}`,Origin:base,"Content-Type":"application/json","Idempotency-Key":randomUUID()},body:JSON.stringify(body)});assert.equal(response.status,200,await response.clone().text());return response.json();};
  try{
    await send("/draft",{transactionId:first,permissions:["read_revenue"],task:"First draft",report:{fileName:"first.txt",text:"First report"}});
    const a=await send("/chat",{transactionId:first,task:"First message",report:{fileName:"first.txt",text:"First report"},historyIds:[]});
    const firstMessage=a.conversations[0].id;
    await send("/draft",{transactionId:second,permissions:["read_regional_margins"],task:"Second draft",report:null});
    await send("/chat",{transactionId:second,task:"Second message",report:null,historyIds:[firstMessage]});
    const restored=await fetch(`${base}/api/workspace?transactionId=${first}`,{headers:{Cookie:`__Host-envoi=${token}`}}).then(r=>r.json());
    assert.equal(restored.draft.report.text,"First report");assert.deepEqual(restored.draft.permissions,["read_revenue"]);
    assert.equal(restored.currentTransaction.id,first);assert.equal(restored.currentTransaction.conversationIds.length,1);
    assert.deepEqual(histories,[[],[]]);assert.equal((await load(w.id)).document.board!.activeId,second);
    assert.equal((await caseDetail(await load(w.id),first)).status,"in_progress");
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("case evidence uses its original receipt and permission rather than the current selection; inconsistent links are omitted",async()=>{
  const {w}=await fixture(),first=randomUUID(),second=randomUUID();
  await mutateCase(w.id,first,{action:"create",title:"Original review"});await mutateCase(w.id,second,{action:"create",title:"Different current review"});
  const saved=await load(w.id),original=saved.document.board!.cases.find(item=>item.id===first)!;
  const tx1=`0x${"1".repeat(64)}`,tx2=`0x${"2".repeat(64)}`;
  const slip:Slip={label:"Original",signature:"offline-fixture",digest:`0x${"3".repeat(64)}`,mandate:{mandateId:"permission-original",issuer:`0x${"4".repeat(40)}`,agentId:"atlas-research-agent",resource:"northwind-data-api",scenarioId:"consulting",allowedActions:["read_regional_margins"],issuedAt:100,expiresAt:200,nonce:"12345678"},anchor:{txHash:tx1,blockNumber:10,blockTimestamp:101,explorerUrl:`https://testnet.monadvision.com/tx/${tx1}`}};
  const block={chainId:10143 as const,blockNumber:11,blockHash:`0x${"5".repeat(64)}`,blockTimestamp:102};
  const receipt:Receipt={id:"r_001",kind:"action",source:"agent",decision:"BLOCKED",action:"read_employee_salaries",agentId:"atlas-research-agent",mandateId:slip.mandate.mandateId,actionTime:102,createdAt:new Date().toISOString(),data:null,explorerUrl:slip.anchor!.explorerUrl,checks:(["signed","agent","valid","stamped","scope"] as const).map(id=>({id,pass:id!=="scope",label:id,detail:"Fixture check"}))};
  const record:AttemptRecord={version:1,attemptId:randomUUID(),receiptId:receipt.id,chainId:10143,permissionFingerprint:slip.digest,requestBlock:{blockNumber:block.blockNumber,blockHash:block.blockHash,blockTimestamp:block.blockTimestamp},agent:"atlas-research-agent",action:"read_employee_salaries",source:"agent",decision:"BLOCKED",checks:receipt.checks.map(({id,pass})=>({id,pass}))};
  receipt.attemptEvidence={record,fingerprint:attemptFingerprint(record),status:"recorded",txHash:tx2,anchor:{txHash:tx2,blockNumber:12,blockTimestamp:102,explorerUrl:`https://testnet.monadvision.com/tx/${tx2}`}};
  saved.document.state.slips.push(slip);saved.document.state.receipts.push(receipt);saved.document.state.contexts.push([receipt.id,{generation:0,originalSlip:structuredClone(slip),requestBlock:block,agentId:receipt.agentId,action:receipt.action,resource:slip.mandate.resource,scenarioId:"consulting"}]);original.permissionIds.push(slip.mandate.mandateId);original.receiptIds.push(receipt.id);
  await pool.query("UPDATE envoi_workspaces SET document=$2 WHERE id=$1",[w.id,JSON.stringify(saved.document)]);
  let detail=await caseDetail(await load(w.id),first);assert.deepEqual(detail.records.map(r=>r.kind),["permission","request"]);assert.equal(detail.records[1].url,`https://testnet.monadvision.com/tx/${tx2}`);
  assert.equal((await caseDetail(await load(w.id),second)).records.length,0);
  assert.equal(detail.status,"open"); // A BLOCKED decision never completes or moves the business case.
  receipt.attemptEvidence.record.receiptId="r_999";
  await pool.query("UPDATE envoi_workspaces SET document=$2 WHERE id=$1",[w.id,JSON.stringify(saved.document)]);
  detail=await caseDetail(await load(w.id),first);assert.deepEqual(detail.records.map(r=>r.kind),["permission"]);
});

test("single-message HTTP retries share one conversation and close document failures without repeating calls",async()=>{
  const {w,token}=await fixture();const caseId=randomUUID();await mutateCase(w.id,caseId,{action:"create",title:"One message"});
  let calls=0;
  const app=express();app.use(express.json());app.use(createWorkspaceRouter(async()=>{calls++;if(calls===2)throw new Error("Offline provider lost answer");return "**Offline document answer**";},()=>true));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const send=(path:string,body:unknown,key=randomUUID())=>fetch(`${base}/api/workspace${path}`,{method:"POST",headers:{Cookie:`__Host-envoi=${token}`,Origin:base,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)});
  const body={transactionId:caseId,task:"Summarize this document",report:{fileName:"local.txt",text:"Offline document"},permissions:["read_revenue"],mode:"document",historyIds:[]};
  const before=(await pool.query("SELECT * FROM envoi_budgets ORDER BY kind")).rows;
  try{
    const key=randomUUID();const first=await send("/submit",body,key);assert.equal(first.status,200);assert.equal((await first.json()).submissionId,key);
    assert.equal((await send("/submit",body,key)).status,200);assert.equal(calls,1);
    assert.equal((await send("/submit",{...body,task:"Different payload"},key)).status,409);
    let saved=await load(w.id);assert.equal(saved.document.conversations.length,1);assert.equal(saved.document.conversations[0].mode,"document");assert.ok(saved.document.board!.cases.find(c=>c.id===caseId)!.conversationIds.includes(key));
    const lost=randomUUID();assert.equal((await send("/submit",{...body,task:"A distinct message"},lost)).status,503);
    assert.equal((await pool.query("SELECT status FROM envoi_operations WHERE id=$1",[lost])).rows[0].status,"failed");
    assert.equal((await send("/submit",{...body,task:"A distinct message"},lost)).status,409);assert.equal(calls,2);
    // Interrupted document-only submission is recoverable without touching chain/provider.
    const active=await load(w.id),crash=await inWorkspace(active,()=>reserve(randomUUID(),"submit",{fixture:true},caseId));
    await pool.query("UPDATE envoi_operations SET payload=$2,updated_at=now()-interval '2 minutes' WHERE id=$1",[crash.id,JSON.stringify({mode:"document",external:true,phase:"document-call"})]);
    assert.equal((await send("/reconcile",{operationId:crash.id})).status,200);assert.equal(calls,2);
    assert.equal((await send("/submit",{...body,task:"After explicit recovery"})).status,200);assert.equal(calls,3);
    saved=await load(w.id);assert.equal(saved.document.state.slips.length,0);assert.equal(saved.document.state.receipts.length,0);
    assert.deepEqual((await pool.query("SELECT * FROM envoi_budgets ORDER BY kind")).rows,before);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test("enforced submission refuses missing configuration before any call; diagnostics read no network unless requested",async()=>{
  const {w,token}=await fixture();let modelCalls=0;
  const app=express();app.use(express.json());app.use(createWorkspaceRouter(async()=>{modelCalls++;return "Must not run";},()=>false));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    const response=await fetch(`${base}/api/workspace/submit`,{method:"POST",headers:{Cookie:`__Host-envoi=${token}`,Origin:base,"Content-Type":"application/json","Idempotency-Key":randomUUID()},body:JSON.stringify({task:"Verify",report:null,mode:"enforced",permissions:["read_revenue"],historyIds:[]})});
    assert.equal(response.status,503);assert.equal(modelCalls,0);assert.equal((await load(w.id)).document.state.slips.length,0);
    let networkReads=0;const read=async()=>{networkReads++;return {ok:true,mockChain:false,issuer:null,rpc:"Configured endpoint"};};
    const config=await serviceDiagnostics(false,read);assert.equal(config.recordingPaused,true);assert.equal(networkReads,0);assert.ok(!config.network);
    const checked=await serviceDiagnostics(true,read);assert.equal(networkReads,1);assert.equal(checked.network?.ok,true);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
