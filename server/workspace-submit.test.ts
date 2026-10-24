import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSubmission,validateSubmission } from "./workspace-submit";
import { freshDocument,type Workspace,type Operation } from "./storage/repository";
import { newCase } from "./storage/transaction-model";
import { withSnapshot } from "./state";
import type { Submission,WorkspaceResponse } from "../shared/workspace";
import type { Receipt } from "../shared/contract";

const issuer=`0x${"1".repeat(40)}`;
const input:Submission={task:"Complete my document request",report:{fileName:"mine.txt",text:"Uploaded text including [[HIDDEN]] untrusted instructions [[/HIDDEN]]"},permissions:["read_regional_margins"],mode:"enforced",historyIds:[]};
function fixture(){
  const op:Operation={id:randomUUID(),workspace_id:randomUUID(),generation:0,kind:"submit",signature:"offline",status:"pending",detail:"",owner:randomUUID(),payload:null};
  const selected=newCase(randomUUID(),"Offline workflow");selected.operationIds.push(op.id);selected.conversationIds.push(op.id);
  const w:Workspace={id:op.workspace_id,generation:0,revision:0,document:freshDocument(),active_operation:op.id};w.document.board={version:1,activeId:selected.id,cases:[selected]};
  const events:string[]=[],snapshots:any[]=[];
  let availability:WorkspaceResponse["availability"]={signing:true,agent:true,chat:true,detail:"Offline fixture"};
  let captured:any;
  const chain={isMockChain:()=>false,issuerAddressOrNull:()=>issuer,latestReference:async()=>{events.push("reference");return {chainId:10143,blockNumber:10,blockHash:`0x${"2".repeat(64)}`,blockTimestamp:100};},anchor:async(_digest:string,options:any)=>{events.push("anchor");assert.equal(options.rebroadcast,false);return {txHash:`0x${"3".repeat(64)}`,blockNumber:11,blockTimestamp:100,explorerUrl:`https://testnet.monadvision.com/tx/0x${"3".repeat(64)}`};}};
  const build=((args:any)=>({...args,issuer,agentId:"atlas-research-agent",resource:"northwind-data-api",expiresAt:200,nonce:"12345678"})) as any;
  const sign=async()=>{events.push("sign");return {signature:"test-only",digest:`0x${"4".repeat(64)}`};};
  const propose=async(value:any)=>{events.push("propose");captured=value;return {transcript:"**Offline proposal**",calls:["read_regional_margins","read_employee_salaries"]};};
  const act=async(req:any,source:any):Promise<Receipt>=>{events.push(req.action);const allowed=input.permissions.includes(req.action);const receipt:Receipt={id:`r_00${w.document.state.receipts.length+1}`,kind:"action",source,agentId:req.agentId,mandateId:req.mandateId,action:req.action,decision:allowed?"ALLOWED":"BLOCKED",createdAt:new Date().toISOString(),actionTime:100,checks:(["signed","agent","valid","stamped","scope"] as const).map(id=>({id,label:id,detail:"",pass:allowed||id!=="scope"})),data:allowed?{fixture:"test-only"}:null,explorerUrl:null};w.document.state.receipts.push(receipt);return receipt;};
  const checkpoint=async(_w:Workspace,op:Operation,payload?:unknown)=>{events.push("checkpoint");snapshots.push(structuredClone({payload,conversations:w.document.conversations}));};
  const chat=async(task:string,report:any,history:any[])=>{events.push("chat");captured={task,report,history};return "Document-only answer";};
  const required={availability:async()=>availability,payModel:async()=>{events.push("pay-model");},chatQuota:async()=>{events.push("chat-quota");}};
  const overrides={chain,build,sign,propose,act,checkpoint,chat};
  return {w,op,selected,events,snapshots,overrides,required,configure:(next:typeof availability)=>{availability=next;},captured:()=>captured,run:(custom={})=>withSnapshot(w.document.state,()=>createSubmission(required,{...overrides,...custom})(w,op,input))};
}
test("one submission signs once, proposes once, and checks every action with the original uploaded report",async()=>{
  const f=fixture();await f.run();
  assert.equal(f.events.filter(e=>e==="sign").length,1);assert.equal(f.events.filter(e=>e==="anchor").length,1);assert.equal(f.events.filter(e=>e==="propose").length,1);
  assert.ok(f.events.indexOf("anchor")<f.events.indexOf("pay-model"));assert.ok(f.events.indexOf("pay-model")<f.events.indexOf("propose"));
  assert.deepEqual(f.captured().upload,input.report);assert.equal(f.w.document.conversations.length,1);
  const reply=f.w.document.conversations[0];assert.equal(reply.id,f.op.id);assert.equal(reply.status,"complete");assert.equal(reply.enforcement?.status,"complete");assert.equal(reply.transcript,"**Offline proposal**");
  assert.equal(reply.receiptIds.length,2);assert.deepEqual(f.w.document.state.receipts.map(r=>r.decision),["ALLOWED","BLOCKED"]);assert.equal(f.w.document.state.receipts[1].data,null);
  assert.deepEqual(f.selected.permissionIds,[reply.permissionId]);assert.ok(f.snapshots.some(s=>s.payload?.phase==="stamping"&&s.payload.slip));
});
test("a matching saved permission is reused even while new recording is paused",async()=>{
  const f=fixture();f.configure({signing:false,agent:true,chat:true,detail:"Recording paused"});
  f.w.document.state.slips.push({mandate:f.overrides.build({mandateId:"existing",scenarioId:"consulting",allowedActions:input.permissions,issuedAt:99}),...await f.overrides.sign(),label:"Original",anchor:{txHash:`0x${"5".repeat(64)}`,blockNumber:9,blockTimestamp:99,explorerUrl:"https://test.invalid"}});
  f.events.length=0;await f.run();assert.ok(!f.events.includes("sign")&&!f.events.includes("anchor"));assert.equal(f.w.document.conversations[0].permissionId,"existing");assert.equal(f.events.filter(e=>e==="propose").length,1);
});
test("expired or different-scope permissions require a new signed version",async()=>{
  for(const expired of [true,false]){const f=fixture();const mandate=f.overrides.build({mandateId:"old",scenarioId:"consulting",allowedActions:expired?input.permissions:["read_revenue"],issuedAt:1});if(expired)mandate.expiresAt=99;
    f.w.document.state.slips.push({mandate,...await f.overrides.sign(),label:"Original",anchor:{txHash:`0x${"6".repeat(64)}`,blockNumber:1,blockTimestamp:2,explorerUrl:"https://test.invalid"}});f.events.length=0;await f.run();assert.equal(f.events.filter(e=>e==="sign").length,1);assert.notEqual(f.w.document.conversations[0].permissionId,"old");}
});
test("paused signing, missing services, and a bad request block never start a paid proposal",async()=>{
  const f=fixture();f.configure({signing:false,agent:true,chat:true,detail:"Paused"});await assert.rejects(f.run(),/paused/);assert.ok(!f.events.includes("sign")&&!f.events.includes("pay-model")&&!f.events.includes("propose"));
  const missing=fixture();missing.configure({signing:false,agent:false,chat:false,detail:"Missing configuration"});await assert.rejects(missing.run(),/Missing configuration/);assert.deepEqual(missing.events,[]);
  const malformed=fixture();await assert.rejects(malformed.run({chain:{...malformed.overrides.chain,latestReference:async()=>({chainId:1,blockNumber:1,blockTimestamp:1,blockHash:"invalid"})}}),/verified/);assert.ok(!malformed.events.includes("pay-model"));
});
test("a lost stamp response remains unknown and never proceeds to the model",async()=>{
  const f=fixture();await assert.rejects(f.run({chain:{...f.overrides.chain,anchor:async()=>{throw new Error("Lost response");}}}),/Lost response/);
  assert.equal(f.w.document.conversations[0].enforcement?.status,"unknown");assert.equal(f.w.document.state.slips.length,0);assert.ok(!f.events.includes("propose"));
});
test("model and ownership failures do not retry or execute unconfirmed tool proposals",async()=>{
  const f=fixture();let calls=0;await assert.rejects(f.run({propose:async()=>{calls++;throw new Error("No model answer");}}),/No model answer/);assert.equal(calls,1);assert.equal(f.w.document.conversations[0].status,"unknown");assert.equal(f.w.document.state.receipts.length,0);
  const stale=fixture();await assert.rejects(stale.run({checkpoint:async(_w:Workspace,op:Operation)=>{if(op.payload?.phase==="checking")throw new Error("Recovery owns the request");}}),/Recovery owns/);assert.equal(stale.w.document.state.receipts.length,0);
});
test("document-only chat never signs, reads chain state, or requests protected data",async()=>{
  const f=fixture();f.configure({signing:false,agent:false,chat:true,detail:"Paused"});
  await withSnapshot(f.w.document.state,()=>createSubmission(f.required,f.overrides)(f.w,f.op,{...input,mode:"document"}));
  assert.deepEqual(f.events.filter(e=>e!=="checkpoint"),["chat-quota","chat"]);assert.equal(f.w.document.conversations[0].permissionId,"");assert.equal(f.w.document.conversations[0].mode,"document");assert.deepEqual(f.captured().report,input.report);
});
test("submission validation refuses ambiguous modes, invalid scope and duplicate history",()=>{
  for(const value of [{...input,mode:"auto"},{...input,permissions:[]},{...input,historyIds:["same","same"]},{...input,task:""}])assert.throws(()=>validateSubmission(value));
});
