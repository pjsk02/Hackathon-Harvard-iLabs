import { CASE_PARTIES, type BoardResponse, type CaseDetail, type CaseSummary, type TransactionCase } from "../../shared/transactions";
import { pool, transaction, type Workspace, type Operation } from "./repository";
import { ensureBoard, newCase } from "./transaction-model";
import { httpError } from "../http";
import { attemptFingerprint } from "../../shared/attempt-record";
import type { Receipt } from "../../shared/contract";

async function lockedWorkspace(id: string, c: import("pg").PoolClient): Promise<Workspace> {
  const w=(await c.query("SELECT * FROM envoi_workspaces WHERE id=$1 AND expires_at>now() FOR UPDATE",[id])).rows[0];
  if (!w) throw httpError(410,"This anonymous workspace expired. Reload to open a new workspace.");
  return w;
}
export async function boardWorkspace(id: string): Promise<Workspace> {
  return transaction(async c=>{
    const w=await lockedWorkspace(id,c);
    if (!w.document.board) {
      if (w.active_operation) throw httpError(409,"An earlier operation is still unresolved. Check it in the workspace before opening the board.");
      const board=ensureBoard(w.document);
      const imported=board.cases.find(item=>item.provenance==="workspace");
      if (imported) imported.operationIds=(await c.query("SELECT id FROM envoi_operations WHERE workspace_id=$1 AND generation=$2",[id,w.generation])).rows.map(row=>row.id);
      await c.query("UPDATE envoi_workspaces SET document=$2,revision=revision+1 WHERE id=$1",[id,JSON.stringify(w.document)]);
    }
    return w;
  });
}
async function operations(w: Workspace): Promise<Operation[]> {
  return (await pool.query("SELECT * FROM envoi_operations WHERE workspace_id=$1 ORDER BY created_at",[w.id])).rows;
}
function ownedCase(w: Workspace,id: string): TransactionCase {
  const item=w.document.board?.cases.find(item=>item.id===id);
  if (!item) throw httpError(404,"This transaction does not belong to your workspace.");
  return item;
}
function receipts(w: Workspace,item: TransactionCase,ops: Operation[]): Receipt[] {
  const ids=new Set([...item.receiptIds,
    ...w.document.conversations.filter(conversation=>item.conversationIds.includes(conversation.id)).flatMap(c=>c.receiptIds),
    ...ops.filter(op=>item.operationIds.includes(op.id) && typeof op.payload?.receiptId==="string").map(op=>op.payload.receiptId)]);
  return w.document.state.receipts.filter(receipt=>ids.has(receipt.id));
}
function summary(w: Workspace,item: TransactionCase,ops: Operation[]): CaseSummary {
  const {conversationIds,permissionIds,operationIds,receiptIds,draft,...metadata}=item;
  const own=ops.filter(op=>operationIds.includes(op.id));
  return {...metadata,parties:CASE_PARTIES[item.scenario],
    updatedAt:own.reduce((at,op)=>new Date((op as any).updated_at).toISOString()>at ? new Date((op as any).updated_at).toISOString() : at,item.updatedAt),
    pending:own.some(op=>op.status==="pending" || op.status==="unknown"),decisions:[...new Set(receipts(w,item,ops).map(r=>r.decision))]};
}
export async function listCases(w: Workspace): Promise<BoardResponse> {
  const ops=await operations(w);
  return { cases:w.document.board!.cases.map(item=>summary(w,item,ops)),activeId:w.document.board!.activeId };
}
function recordUrl(value: unknown,tx: unknown): string | null {
  if (typeof value!=="string" || typeof tx!=="string" || !/^0x[a-f0-9]{64}$/i.test(tx)) return null;
  try {
    const url=new URL(value);
    return url.protocol==="https:" && !url.username && !url.password && !url.search && !url.hash &&
      ["testnet.monadvision.com","testnet.monadexplorer.com"].includes(url.hostname) &&
      url.pathname.replace(/\/$/,"")===`/tx/${tx}` ? url.href : null;
  } catch { return null; }
}
export async function caseDetail(w: Workspace,id: string): Promise<CaseDetail> {
  const item=ownedCase(w,id), ops=await operations(w);
  const result: CaseDetail={...summary(w,item,ops),timeline:[],records:[],checklist:[],conversationCount:item.conversationIds.filter(id=>w.document.conversations.some(c=>c.id===id)).length};
  if (item.provenance==="example") {
    result.timeline=[{at:item.createdAt,title:"Illustrative test case",detail:item.scenario==="consulting" ? "A fictional regional profitability review, shown completed to demonstrate the board. No real agent run or public record is asserted." : "A fictional merchant evidence review, awaiting the issuing bank’s review. No evidence has been sent and no chargeback outcome is asserted."}];
    result.checklist=item.scenario==="chargeback" ? ["Order confirmation","Payment-authorization evidence","Delivery confirmation","Merchant–customer correspondence","Await issuing-bank review"] : ["Define permitted data","Review regional profitability","Complete the illustrative review"];
    return result;
  }
  result.timeline=[{at:item.createdAt,title:"Transaction opened",detail:"Browser-owned workspace case."},
    ...ops.filter(op=>item.operationIds.includes(op.id)).map(op=>({at:new Date((op as any).created_at).toISOString(),title:`${({chat:"Document chat",run:"Permissioned request",act:"Manual data request",sign:"Permission signing",draft:"Draft saved"} as Record<string,string>)[op.kind] ?? "Workspace operation"} · ${op.status}`,detail:op.detail}))];
  for (const slip of w.document.state.slips.filter(s=>item.permissionIds.includes(s.mandate.mandateId))) {
    const url=recordUrl(slip.anchor?.explorerUrl,slip.anchor?.txHash);
    if (url) result.records.push({kind:"permission",reference:slip.mandate.mandateId,url});
  }
  for (const receipt of receipts(w,item,ops)) {
    const e=receipt.attemptEvidence;
    if (e?.status!=="recorded") continue;
    const url=recordUrl(e.anchor.explorerUrl,e.txHash), context=w.document.state.contexts.find(([id])=>id===receipt.id)?.[1];
    try {
      if (url && e.anchor.txHash===e.txHash && e.record.chainId===10143 && e.record.receiptId===receipt.id &&
          e.record.agent===receipt.agentId && e.record.action===receipt.action && e.record.decision===receipt.decision && e.record.source===receipt.source &&
          context && e.record.permissionFingerprint===context.originalSlip.digest.toLowerCase() &&
          e.record.requestBlock.blockNumber===context.requestBlock.blockNumber && e.record.requestBlock.blockHash===context.requestBlock.blockHash.toLowerCase() &&
          e.record.requestBlock.blockTimestamp===receipt.actionTime && e.record.checks.length===receipt.checks.length &&
          receipt.checks.every(check=>e.record.checks.some(item=>item.id===check.id && item.pass===check.pass)) && attemptFingerprint(e.record)===e.fingerprint) {
        result.records.push({kind:"request",reference:receipt.id,url});
      }
    } catch { /* Inconsistent saved evidence never becomes a public-record link. */ }
  }
  result.timeline.sort((a,b)=>a.at.localeCompare(b.at));
  return result;
}

export async function mutateCase(workspaceId: string,id: string,input: {action:"create";title:string} | {action:"status";status:"done"|"in_progress";revision:number}): Promise<Workspace> {
  return transaction(async c=>{
    const w=await lockedWorkspace(workspaceId,c);
    if (w.active_operation) throw httpError(409,"An operation is still active or unresolved. Check its status before changing transactions.");
    const hadBoard=!!w.document.board;
    const board=ensureBoard(w.document);
    if (!hadBoard) {
      const imported=board.cases.find(item=>item.provenance==="workspace");
      if(imported) imported.operationIds=(await c.query("SELECT id FROM envoi_operations WHERE workspace_id=$1 AND generation=$2",[w.id,w.generation])).rows.map(row=>row.id);
    }
    if (input.action==="create") {
      const existing=board.cases.find(item=>item.id===id);
      if (existing) {
        if (existing.provenance!=="workspace" || existing.title!==input.title) throw httpError(409,"This request identifier already belongs to another transaction.");
        return w;
      }
      if (board.cases.length>=102) throw httpError(429,"This workspace has reached its 100-transaction limit.");
      const prior=board.cases.find(item=>item.id===board.activeId);
      if(prior && prior.provenance==="workspace" && !prior.draft) prior.draft=structuredClone(w.document.draft);
      const created=newCase(id,input.title);
      created.draft={...structuredClone(w.document.draft),task:"",report:null};
      board.cases.push(created); board.activeId=id;
    } else {
      const item=ownedCase(w,id);
      if (item.provenance==="example") throw httpError(400,"Test examples are illustrative. Create a transaction for your own work.");
      if (item.revision!==input.revision) throw httpError(409,"This transaction changed in another tab. Refresh before updating it.");
      if ((await c.query("SELECT 1 FROM envoi_operations WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND status IN ('pending','unknown') LIMIT 1",[w.id,item.operationIds])).rowCount) throw httpError(409,"An operation is still unresolved. Business completion is unavailable until its status is established.");
      if ((input.status==="done" && item.status==="done") || (input.status==="in_progress" && item.status!=="done")) throw httpError(409,"This transaction is already in that stage. Refresh its status.");
      item.status=input.status;item.revision++;item.updatedAt=new Date().toISOString();
    }
    if (Buffer.byteLength(JSON.stringify(w.document))>2_000_000) throw httpError(413,"This workspace has reached its retained-content limit.");
    await c.query("UPDATE envoi_workspaces SET document=$2,revision=revision+1 WHERE id=$1",[w.id,JSON.stringify(w.document)]);
    return w;
  });
}
