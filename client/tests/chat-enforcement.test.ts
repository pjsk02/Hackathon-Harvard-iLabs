import assert from "node:assert/strict";
import { test } from "node:test";
import { chatEnforcement } from "../src/split/chat-enforcement";
import type { Conversation } from "../../shared/workspace";
import type { Receipt } from "../../shared/contract";

const message: Conversation = {id:"chat",task:"Review this",report:{fileName:"mine.txt",text:"My report"},permissionId:"",createdAt:"2026-10-24T00:00:00Z",transcript:"A reply",receiptIds:[],status:"complete"};
const run: Conversation = {...message,id:"run",permissionId:"p1",receiptIds:["r1"]};
const receipt = {id:"r1",mandateId:"p1",source:"agent",decision:"ALLOWED",checks:["signed","agent","valid","stamped","scope"].map(id=>({id,pass:true}))} as Receipt;

test("document chat never claims enforcement from the reply alone",()=>{
  assert.equal(chatEnforcement(message,[message],[]).state,"not-run");
});
test("matches recorded allowed or blocked evidence even with reordered document keys",()=>{
  const reordered={...run,report:{text:"My report",fileName:"mine.txt"}};
  assert.equal(chatEnforcement(message,[message,reordered],[receipt]).state,"allowed");
  assert.equal(chatEnforcement(message,[message,reordered],[{...receipt,decision:"BLOCKED"}]).state,"blocked");
});
test("unknown, incomplete and tool-free outcomes do not claim enforcement",()=>{
  assert.equal(chatEnforcement(message,[message,{...run,status:"unknown"}],[receipt]).state,"pending");
  assert.equal(chatEnforcement(message,[message,run],[]).state,"pending");
  assert.equal(chatEnforcement(message,[message,run],[{...receipt,mandateId:"another"}]).state,"pending");
  assert.equal(chatEnforcement(message,[message,{...run,receiptIds:[]}],[]).state,"no-access");
});
test("does not borrow a result from an earlier or later identical request",()=>{
  const next={...message,id:"second-chat"};
  assert.equal(chatEnforcement(next,[message,run,next],[receipt]).state,"not-run");
  assert.equal(chatEnforcement(message,[message,next,run],[receipt]).state,"not-run");
  assert.equal(chatEnforcement(message,[message,{...run,task:"different"}],[receipt]).state,"not-run");
});
