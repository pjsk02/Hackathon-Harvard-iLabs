// One durable submission: no client-side chaining of paid or signing requests.
import type { Slip } from "../shared/contract";
import { AGENT_ID, RESOURCE } from "../shared/contract";
import { DEFAULT_SCENARIO_ID } from "../shared/scenarios";
import { validSelection, type Conversation, type Submission, type WorkspaceResponse } from "../shared/workspace";
import type { Workspace, Operation } from "./storage/repository";
import { checkpoint } from "./storage/repository";
import * as chain from "./chain";
import * as state from "./state";
import { buildMandate, signMandate } from "./chain/slip";
import { assertRequestBlock } from "./gateway/workspace-checks";
import { act } from "./gateway/workspace-gateway";
import { proposeCalls, validateAgentInput } from "./agent/workspace-agent";
import { chatWithDocument } from "./agent/chat";
import { httpError } from "./http";

export function validateSubmission(body: any): Submission {
  const input=validateAgentInput({reportId:"clean",task:body?.task,...(body?.report ? {upload:body.report} : {})});
  if(!input.task || !["enforced","document"].includes(body?.mode) || !validSelection(body?.permissions)) throw httpError(400,"Write a request, choose permissions, and select the request mode.");
  const historyIds=body?.historyIds ?? [];
  if(!Array.isArray(historyIds) || historyIds.length>8 || historyIds.some(id=>typeof id!=="string" || id.length>100) || new Set(historyIds).size!==historyIds.length) throw httpError(400,"Choose up to eight distinct messages from this conversation.");
  return {task:input.task,report:input.upload ?? null,mode:body.mode,permissions:[...body.permissions].sort(),historyIds:[...historyIds]};
}

type Dependencies = {
  availability: ()=>Promise<WorkspaceResponse["availability"]>;
  chain: Pick<typeof chain,"isMockChain"|"issuerAddressOrNull"|"latestReference"|"anchor">;
  build: typeof buildMandate; sign: typeof signMandate;
  propose: typeof proposeCalls; act: typeof act; chat: typeof chatWithDocument;
  checkpoint: typeof checkpoint;
  payModel: ()=>Promise<void>; chatQuota: ()=>Promise<void>;
};
export type SubmissionOverrides=Partial<Omit<Dependencies,"availability"|"payModel"|"chatQuota">>;
export function createSubmission(required: Pick<Dependencies,"availability"|"payModel"|"chatQuota">, overrides: SubmissionOverrides={}) {
  const deps:Dependencies={...required,chain,build:buildMandate,sign:signMandate,propose:proposeCalls,act,chat:chatWithDocument,checkpoint,...overrides};
  return async function submit(w:Workspace,op:Operation,input:Submission):Promise<void>{
    input=validateSubmission(input);
    const availability=await deps.availability();
    if(input.mode==="document" ? !availability.chat : !availability.agent || deps.chain.isMockChain() || !deps.chain.issuerAddressOrNull()) throw httpError(503,input.mode==="document"?"Configure Anthropic to enable document chat. No permission or chain record is created in this mode.":availability.detail);
    if(w.document.conversations.length>=100)throw httpError(429,"This workspace has reached its 100-message limit.");
    const selected=w.document.board?.cases.find(item=>item.operationIds.includes(op.id));
    const history=w.document.conversations.filter(item=>(!selected || selected.conversationIds.includes(item.id)) && input.historyIds.includes(item.id));
    w.document.draft={task:input.task,report:input.report,permissions:input.permissions};
    const conversation:Conversation={id:op.id,task:input.task,report:input.report,permissionId:"",createdAt:new Date().toISOString(),transcript:"",receiptIds:[],status:"pending",mode:input.mode};
    w.document.conversations.push(conversation);
    op.payload={mode:input.mode,conversationId:op.id,phase:"preparing"};
    await deps.checkpoint(w,op,op.payload);
    try {
      if(input.mode==="document") {
        await deps.chatQuota();
        op.payload={...op.payload,external:true,phase:"document-call"};
        await deps.checkpoint(w,op,op.payload);
        conversation.transcript=await deps.chat(input.task,input.report,history);
      } else {
        const issuer=deps.chain.issuerAddressOrNull()!;
        const reference=await deps.chain.latestReference();assertRequestBlock(reference);
        let slip=w.document.state.slips.slice().reverse().find(s=>s.anchor && s.mandate.issuer.toLowerCase()===issuer.toLowerCase() && s.mandate.agentId===AGENT_ID && s.mandate.resource===RESOURCE && s.mandate.scenarioId===DEFAULT_SCENARIO_ID && s.mandate.issuedAt<=reference.blockTimestamp && s.mandate.expiresAt>reference.blockTimestamp && s.mandate.allowedActions.length===input.permissions.length && input.permissions.every(action=>s.mandate.allowedActions.includes(action)));
        if(!slip){
          if(!availability.signing)throw httpError(503,"The selected permissions need a new stamp, but live recording is paused or unavailable. No AI call was started.");
          if(w.document.state.slips.length>=50)throw httpError(429,"This workspace has reached its 50-permission limit.");
          conversation.enforcement={status:"signing",detail:"Signing and stamping the selected permissions."};
          const mandate=deps.build({scenarioId:DEFAULT_SCENARIO_ID,allowedActions:input.permissions,mandateId:`permission-${op.id}`,issuedAt:reference.blockTimestamp});
          op.payload={...op.payload,external:true,phase:"signing",mandate};
          await deps.checkpoint(w,op,op.payload);
          const signed=await deps.sign(mandate);
          slip={mandate,...signed,label:"Original",anchor:null};
          op.payload={...op.payload,slip,phase:"stamping"};
          await deps.checkpoint(w,op,op.payload);
          slip.anchor=await deps.chain.anchor(slip.digest,{rebroadcast:false});
          state.addSlip(slip,w.generation);
        }
        conversation.permissionId=slip.mandate.mandateId;
        if(selected && !selected.permissionIds.includes(conversation.permissionId))selected.permissionIds.push(conversation.permissionId);
        conversation.enforcement={status:"checking",detail:"The agent proposes data actions; the bouncer checks each one."};
        op.payload={...op.payload,permissionId:conversation.permissionId,phase:"permission-ready"};
        await deps.checkpoint(w,op,op.payload);
        await deps.payModel();
        op.payload={...op.payload,external:true,phase:"model-call"};
        await deps.checkpoint(w,op,op.payload);
        const proposal=await deps.propose({reportId:"clean",task:input.task,...(input.report ? {upload:input.report} : {})});
        conversation.transcript=proposal.transcript;
        op.payload={...op.payload,calls:proposal.calls,phase:"checking"};
        await deps.checkpoint(w,op,op.payload);
        for(const action of proposal.calls){
          const receipt=await deps.act({action,mandateId:conversation.permissionId,agentId:AGENT_ID},"agent");
          conversation.receiptIds.push(receipt.id);
          await deps.checkpoint(w,op,op.payload);
        }
        conversation.enforcement={status:"complete",detail:proposal.calls.length ? "Permission checks completed. Inspect each saved receipt for its decision and public-record status." : "The agent requested no protected-data action. No access decision was created."};
      }
      conversation.status="complete";
    }catch(error){
      conversation.status="unknown";
      if(input.mode==="enforced")conversation.enforcement={status:op.payload?.external?"unknown":"unavailable",detail:op.payload?.external?"The outcome is unconfirmed. Check status; the request will not be repeated automatically.":"Permission enforcement could not start. No access decision was created."};
      throw error;
    }
  };
}
