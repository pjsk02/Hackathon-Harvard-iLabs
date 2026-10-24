import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, freshDocument, inWorkspace, load, reserve, checkpoint, finish, type Workspace } from "./repository";
import { ACTIONS, validSelection } from "../../shared/workspace";
import { createGateway } from "../gateway/workspace-gateway";
import * as state from "../state";
import { AGENT_ID, CHAIN_ID } from "../../shared/contract";
import type { Slip } from "../../shared/contract";
import express from "express";
import { workspaceRouter, createWorkspaceRouter } from "../routes/workspace";
import { errorHandler } from "../http";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { Wallet, keccak256 } from "ethers";
import { journaledRpc } from "./broadcast";
import { activeExternal } from "./repository";

const ids: string[] = [];
async function fixture() {
  const id = randomUUID(); ids.push(id);
  await pool.query("INSERT INTO envoi_workspaces(id,capability_hash,document) VALUES($1,$2,$3)",[id,id,JSON.stringify(freshDocument())]);
  return load(id);
}
after(async () => {
  for (const id of ids) {
    await pool.query("DELETE FROM envoi_operations WHERE workspace_id=$1",[id]);
    await pool.query("DELETE FROM envoi_workspaces WHERE id=$1",[id]);
  }
  await pool.end();
});
test("draft, extracted report and state survive a fresh repository read; workspaces are isolated", async () => {
  const a = await fixture(), b = await fixture();
  await inWorkspace(a, async () => {
    const op = await reserve(randomUUID(),"draft",{task:"saved"});
    a.document.draft.task = "saved";
    a.document.draft.report = {fileName:"report.txt",text:"untrusted extracted text"};
    a.document.draft.permissions = ACTIONS.map(a => a.id);
    await checkpoint(a,op); await finish(a,op,"complete","Saved");
  });
  const restored = await load(a.id);
  assert.equal(restored.document.draft.task,"saved");
  assert.equal(restored.document.draft.report?.text,"untrusted extracted text");
  assert.equal(restored.document.draft.permissions.length,6);
  assert.notEqual((await load(b.id)).document.draft.task,"saved");
});
test("durable UUIDs block altered input and unknown work after process-local state is discarded",async () => {
  const a = await fixture(); const key = randomUUID();
  await inWorkspace(a,async () => {
    const op = await reserve(key,"run",{task:"x"});
    await checkpoint(a,op,{external:true});
    await finish(a,op,"unknown","lost response");
  });
  await inWorkspace(await load(a.id),async () => {
    assert.equal((await reserve(key,"run",{task:"x"})).reused,true);
    await assert.rejects(reserve(key,"run",{task:"changed"}),/already used/);
    await assert.rejects(reserve(randomUUID(),"run",{task:"x"}),/unconfirmed/);
  });
});
test("reset and recovery-owner changes fence stale commits",async () => {
  const a = await fixture();
  await inWorkspace(a,async () => {
    const op = await reserve(randomUUID(),"sign",{});
    await pool.query("UPDATE envoi_operations SET owner=$2 WHERE id=$1",[op.id,randomUUID()]);
    await assert.rejects(checkpoint(a,op),/ownership/);
    await assert.rejects(finish(a,op,"complete","stale"),/ownership/);
    const other = await fixture();
    await inWorkspace(other,async () => {
      const old = await reserve(randomUUID(),"run",{});
      await pool.query("UPDATE envoi_workspaces SET generation=generation+1,active_operation=NULL WHERE id=$1",[other.id]);
      await assert.rejects(checkpoint(other,old),/reset/);
      await finish(other,old,"unknown","external result unknown");
      assert.equal((await load(other.id)).generation,1);
    });
  });
});
test("six-action gateway allows exact scope and never reads data on denial; historical scope cannot be replaced",async () => {
  const snapshot = state.emptySnapshot();
  await state.withSnapshot(snapshot,async () => {
    const slip: Slip = {mandate:{mandateId:"version-1",issuer:"0x"+"1".repeat(40),agentId:AGENT_ID,resource:"northwind-data-api",scenarioId:"consulting",allowedActions:ACTIONS.map(a=>a.id),issuedAt:1,expiresAt:1000,nonce:"12345678"},signature:"offline",digest:"0x"+"1".repeat(64),label:"Original",anchor:null};
    state.addSlip(slip);
    assert.throws(()=>state.addSlip(structuredClone(slip)),/cannot be replaced/);
    let reads = 0;
    const gateway = createGateway({state,
      latestReference:async()=>({chainId:CHAIN_ID,blockNumber:10,blockHash:"0x"+"2".repeat(64),blockTimestamp:100}),
      evaluate:async(s,action)=>["signed","agent","valid","stamped","scope"].map(id=>({id:id as any,label:id,detail:"",pass:id!=="scope" || s.mandate.allowedActions.includes(action)})),
      record:async receipt=>receipt, readData:action=>{ reads++; return [{action}]; }});
    for (const action of ACTIONS) assert.equal((await gateway({agentId:AGENT_ID,mandateId:"version-1",action:action.id},"forced")).decision,"ALLOWED");
    const denied = structuredClone(slip); denied.mandate.mandateId="version-2"; denied.mandate.allowedActions=[];
    state.addSlip(denied);
    for (const action of ACTIONS) {
      const receipt = await gateway({agentId:AGENT_ID,mandateId:"version-2",action:action.id},"forced");
      assert.equal(receipt.decision,"BLOCKED"); assert.equal(receipt.data,null);
    }
    assert.equal(reads,6);
    assert.equal(state.getSlip("version-1")!.mandate.allowedActions.length,6);
  });
});
test("selection validation rejects empty, duplicated and unknown actions",()=>{
  for (const value of [[],["x"],["read_revenue","read_revenue"],null]) assert.equal(validSelection(value),false);
  for (const action of ACTIONS) assert.equal(validSelection([action.id]),true);
});
test("HTTP sessions persist edits, reject cross-origin writes and isolate reset",async () => {
  const app = express(); app.use(express.json()); app.use(workspaceRouter); app.use(errorHandler);
  const server = app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const address = server.address() as {port:number}; const base = `http://127.0.0.1:${address.port}`;
  async function open() {
    const response = await fetch(`${base}/api/workspace`);
    assert.equal(response.status,200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/Secure/); assert.match(cookie,/SameSite=Strict/);
    return cookie.split(";")[0];
  }
  const a = await open(), b = await open();
  const send = (cookie:string,path:string,body:unknown,origin=base) => fetch(`${base}/api/workspace${path}`,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,Cookie:cookie,"Idempotency-Key":randomUUID()},body:JSON.stringify(body)});
  try {
    const draft = {permissions:["read_revenue"],task:"Retained API request",report:{fileName:"input.txt",text:"extracted content"}};
    assert.equal((await send(a,"/draft",draft,"https://untrusted.example")).status,403);
    assert.equal((await send(a,"/draft",draft)).status,200);
    assert.equal((await (await fetch(`${base}/api/workspace`,{headers:{Cookie:a}})).json()).draft.task,draft.task);
    assert.equal((await send(b,"/reset",{})).status,200);
    assert.equal((await (await fetch(`${base}/api/workspace`,{headers:{Cookie:a}})).json()).draft.task,draft.task);
    assert.equal((await send(a,"/sign",{permissions:[]})).status,400);
  } finally {
    // Only test-created browser capabilities are removed.
    const {hash} = await import("./repository");
    for (const cookie of [a,b]) {
      const row = await pool.query("SELECT id FROM envoi_workspaces WHERE capability_hash=$1",[hash(cookie.slice(13))]);
      if (row.rows[0]) ids.push(row.rows[0].id);
    }
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
test("database write-ahead journal survives a lost broadcast response and refuses a second send",async () => {
  // Completely separate schema: fixture budgets never change the application's allowance.
  const schema = `offline_${randomUUID().replaceAll("-","")}`;
  await pool.query(`CREATE SCHEMA ${schema}`);
  const isolated = new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:1});
  try {
    await isolated.query(await readFile(new URL("./schema.sql",import.meta.url),"utf8"));
    await isolated.query("UPDATE envoi_budgets SET approved=1 WHERE kind='chain'");
    const store = {
      transaction: async <T>(work:(c:pg.PoolClient)=>Promise<T>) => {
        const c = await isolated.connect();
        try {await c.query("BEGIN");const value=await work(c);await c.query("COMMIT");return value;}
        catch(e){await c.query("ROLLBACK");throw e;} finally{c.release();}
      },
      spend: async (c:pg.PoolClient,kind:"chain"|"model") => {
        const r=await c.query("UPDATE envoi_budgets SET spent=spent+1 WHERE kind=$1 AND spent<approved RETURNING spent",[kind]);
        if(!r.rowCount) throw new Error("Fixture budget exhausted");
      },
    };
    const signer=Wallet.createRandom();
    const raw=await signer.signTransaction({chainId:10143,to:signer.address,nonce:0,gasLimit:30000,gasPrice:1,data:"0x"+"1".repeat(64)});
    let sends=0;
    const transport=journaledRpc(async <T>()=>{
      sends++;
      assert.equal((await isolated.query("SELECT status FROM envoi_broadcasts WHERE tx_hash=$1",[keccak256(raw)])).rows[0].status,"unknown");
      throw new Error("Lost response after submission");
    },store);
    const w=await fixture();
    await inWorkspace(w,async()=>{
      const op=await reserve(randomUUID(),"act",{});
      const context={op,checkpoint:()=>checkpoint(w,op)};
      await activeExternal.run(context,()=>assert.rejects(transport("eth_sendRawTransaction",[raw],Date.now()+8000),/Lost response/));
      // New wrapper simulates a process losing every in-memory retry cache.
      const restarted=journaledRpc(async <T>()=>{sends++;return "" as T;},store);
      await activeExternal.run(context,()=>assert.rejects(restarted("eth_sendRawTransaction",[raw],Date.now()+8000),/unconfirmed|submitted/));
      assert.equal(sends,1);
      assert.equal((await isolated.query("SELECT spent FROM envoi_budgets WHERE kind='chain'")).rows[0].spent,1);
      await finish(w,op,"unknown","fixture uncertainty");
    });
  } finally {
    await isolated.end();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  }
});

test("model failure and crash recovery preserve no-retry identity but permit distinct new messages; reset refuses active saves",async()=>{
  const w=await fixture();
  const token=randomUUID().replaceAll("-","")+randomUUID().replaceAll("-","");
  const {hash}=await import("./repository");
  await pool.query("UPDATE envoi_workspaces SET capability_hash=$2 WHERE id=$1",[w.id,hash(token)]);
  let calls=0;
  const app=express();app.use(express.json());
  app.use(createWorkspaceRouter(async()=>{
    calls++;
    if(calls===1) throw new Error("Simulated provider timeout; no external call");
    return "Offline fixture answer";
  }));
  app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const send=(path:string,body:unknown,key=randomUUID())=>fetch(`${base}/api/workspace${path}`,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,Cookie:`__Host-envoi=${token}`,"Idempotency-Key":key},body:JSON.stringify(body)});
  try {
    const first=randomUUID(),body={task:"Summarize my document",report:{fileName:"mine.txt",text:"User text"}};
    assert.equal((await send("/chat",body,first)).status,503);
    assert.equal((await pool.query("SELECT status FROM envoi_operations WHERE id=$1",[first])).rows[0].status,"failed");
    assert.equal((await send("/reconcile",{operationId:first})).status,200);
    assert.equal((await send("/chat",body,first)).status,409);
    assert.equal(calls,1);
    assert.equal((await send("/chat",{...body,task:"A distinct message"})).status,200);
    assert.equal(calls,2);
    // Simulate a process dying after reserving model work, before result commit.
    const crash=await inWorkspace(await load(w.id),()=>reserve(randomUUID(),"chat",{task:"crashed"}));
    await pool.query("UPDATE envoi_operations SET payload=$2,updated_at=now()-interval '2 minutes' WHERE id=$1",[crash.id,JSON.stringify({external:true})]);
    assert.equal((await send("/reconcile",{operationId:crash.id})).status,200);
    assert.equal((await send("/reset",{})).status,200);
    assert.equal((await send("/chat",{...body,task:"After recovery and reset"})).status,200);
    assert.equal(calls,3);
    // Reset cannot turn an interrupted local draft save into model uncertainty.
    const active=await load(w.id);
    const draft=await inWorkspace(active,()=>reserve(randomUUID(),"draft",{task:"saving"}));
    assert.equal((await send("/reset",{})).status,409);
    assert.equal((await load(w.id)).generation,active.generation);
    await pool.query("UPDATE envoi_operations SET updated_at=now()-interval '2 minutes' WHERE id=$1",[draft.id]);
    assert.equal((await send("/reconcile",{operationId:draft.id})).status,200);
    assert.equal((await send("/reset",{})).status,200);
  } finally {await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
