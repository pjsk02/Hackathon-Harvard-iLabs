import { Router } from "express";
import { randomUUID } from "node:crypto";
import { ACTIONS, validSelection, type Draft, type WorkspaceResponse } from "../../shared/workspace";
import { AGENT_ID, type Slip } from "../../shared/contract";
import { UUID_PATTERN } from "../../shared/attempt-record";
import { DEFAULT_SCENARIO_ID } from "../../shared/scenarios";
import * as state from "../state";
import * as chain from "../chain";
import { buildMandate, signMandate } from "../chain/slip";
import { act } from "../gateway/workspace-gateway";
import { proposeCalls, validateAgentInput } from "../agent/workspace-agent";
import { llmConfigured } from "../agent/llm";
import { chatWithDocument } from "../agent/chat";
import { httpError, HttpError } from "../http";
import { activeExternal, budget, checkpoint, finish, freshDocument, load, pool, reserve, spend, transaction, workspace, workspaceSession, type Operation, type Workspace } from "../storage/repository";

export function createWorkspaceRouter(chat = chatWithDocument) {
const workspaceRouter = Router();
workspaceRouter.use("/api/workspace", workspaceSession);

function requestKey(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw httpError(400, "A UUID Idempotency-Key is required.");
  return value.toLowerCase();
}
function validateDraft(value: any): Draft {
  if (!value || !validSelection(value.permissions)) throw httpError(400, "Select one or more of the six permissions, without duplicates.");
  const input = validateAgentInput({ reportId: "clean", task: value.task, ...(value.report === null ? {} : { upload: value.report }) });
  if (!input.task) throw httpError(400, "Write a request before saving.");
  return { permissions: [...value.permissions].sort(), task: input.task.trim(), report: input.upload ?? null };
}
async function availability() {
  const [b, m, pending] = await Promise.all([
    budget("chain"), budget("model"), pool.query("SELECT 1 FROM envoi_broadcasts WHERE status='unknown' LIMIT 1"),
  ]);
  const live = !chain.isMockChain() && !!chain.issuerAddressOrNull() &&
    Number(process.env.MONAD_MAX_TRANSACTIONS ?? 0) > 0 && !!b && b.spent < b.approved && !pending.rowCount;
  const agent = live && llmConfigured() && !!m && m.spent < m.approved;
  return {
    signing: live, agent, chat: llmConfigured(),
    detail: !live ? "Live recording is unavailable. The operator must configure signing and approve a remaining durable Monad allowance; unresolved issuer transactions must be checked first. Reset does not renew allowances."
      : !agent ? "Recording is available. To run Atlas, configure Anthropic and approve a remaining AI-call allowance." :
        "Live operations are configured. Each request consumes approved allowances; connectivity is verified when requested.",
  };
}
async function response(w: Workspace): Promise<WorkspaceResponse> {
  const operations = await pool.query("SELECT id,kind,status,detail FROM envoi_operations WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 500", [w.id]);
  return { generation: w.generation, draft: w.document.draft, conversations: w.document.conversations,
    slips: w.document.state.slips, receipts: [...w.document.state.receipts].reverse(),
    operations: operations.rows, availability: await availability() };
}
workspaceRouter.get("/api/workspace", async (_req,res) => res.json(await response(workspace())));

async function perform(key: string, kind: string, input: unknown, work: (w: Workspace, op: Operation) => Promise<void>) {
  const w = workspace();
  const op = await reserve(key,kind,input);
  if (op.reused) {
    if (op.status !== "complete") throw httpError(409, "This operation already exists and was not repeated. Check its recorded status.");
    return response(await load(w.id));
  }
  await state.withSnapshot(w.document.state, () => activeExternal.run({op, checkpoint: () => checkpoint(w,op)}, async () => {
    try {
      await work(w,op);
      await checkpoint(w,op,{ ...op.payload, phase: "ready" });
      const pending = await pool.query("SELECT 1 FROM envoi_broadcasts WHERE operation_id=$1 AND status='unknown' LIMIT 1",[op.id]);
      await finish(w,op,pending.rowCount ? "unknown" : "complete",pending.rowCount ? "The decision is saved; public recording is unconfirmed. Check status without repeating the request." : "Completed and saved.");
    } catch (error) {
      const external = op.payload?.external === true;
      const detail = external && kind === "chat" ? "No answer was received; the provider outcome and charge remain unknown. This message is closed and will not be repeated. You may send a new message."
        : external ? "Completion is unconfirmed. Check status; this operation will not be repeated automatically."
        : error instanceof HttpError ? error.message : "The operation could not complete. No external work was started.";
      await finish(w,op,external && kind !== "chat" ? "unknown" : "failed",detail);
      throw error instanceof HttpError ? error : httpError(503, detail);
    }
  }));
  return response(await load(w.id));
}
workspaceRouter.post("/api/workspace/draft", async (req,res) => {
  const draft = validateDraft(req.body);
  res.json(await perform(requestKey(req.get("Idempotency-Key")),"draft",draft,async w => { w.document.draft = draft; }));
});
workspaceRouter.post("/api/workspace/sign", async (req,res) => {
  if (!validSelection(req.body?.permissions)) throw httpError(400, "Select one or more of the six permissions, without duplicates.");
  const permissions = [...req.body.permissions].sort();
  res.json(await perform(requestKey(req.get("Idempotency-Key")),"sign",{permissions},async (w,op) => {
    if (!(await availability()).signing) throw httpError(503,(await availability()).detail);
    if (w.document.state.slips.length >= 50) throw httpError(429,"This workspace has reached its 50-version limit.");
    const ref = await chain.latestReference();
    const mandate = buildMandate({ scenarioId: DEFAULT_SCENARIO_ID, allowedActions: permissions, mandateId: `permission-${op.id}`, issuedAt: ref.blockTimestamp });
    // Persist the exact unsigned scope before local signing. Unknown operations never sign twice.
    op.payload = { external: true, mandate };
    await checkpoint(w,op,op.payload);
    const signed = await signMandate(mandate);
    const slip: Slip = { mandate, ...signed, label: "Original", anchor: null };
    op.payload = { external: true, slip };
    await checkpoint(w,op,op.payload);
    slip.anchor = await chain.anchor(slip.digest, { rebroadcast: false });
    state.addSlip(slip,w.generation);
    w.document.draft.permissions = permissions;
    op.payload = { external: true, slip };
  }));
});
function permission(w: Workspace, id: unknown) {
  if (typeof id !== "string" || !w.document.state.slips.some(s => s.mandate.mandateId === id)) throw httpError(400,"Choose an issued permission version from this workspace.");
  return id;
}
workspaceRouter.post("/api/workspace/act", async (req,res) => {
  const action = req.body?.action;
  if (!ACTIONS.some(a => a.id === action)) throw httpError(400,"Choose one of the six supported data actions.");
  const permissionId = permission(workspace(),req.body?.permissionId);
  res.json(await perform(requestKey(req.get("Idempotency-Key")),"act",{action,permissionId},async (w,op) => {
    if (!(await availability()).signing) throw httpError(503,(await availability()).detail);
    permission(w,permissionId);
    op.payload = { external: true, action, permissionId };
    await checkpoint(w,op,op.payload);
    const receipt = await act({ action,mandateId: permissionId,agentId: AGENT_ID },"forced");
    op.payload.receiptId = receipt.id;
  }));
});
workspaceRouter.post("/api/workspace/run", async (req,res) => {
  const input = validateAgentInput({reportId:"clean",task:req.body?.task,...(req.body?.report ? {upload:req.body.report} : {})});
  if (!input.task) throw httpError(400,"Write a request before running Atlas.");
  const permissionId = permission(workspace(),req.body?.permissionId);
  res.json(await perform(requestKey(req.get("Idempotency-Key")),"run",{...input,permissionId},async (w,op) => {
    if (!(await availability()).agent) throw httpError(503,(await availability()).detail);
    permission(w,permissionId);
    if (w.document.conversations.length >= 100) throw httpError(429,"This workspace has reached its 100-request limit.");
    const conversation = { id: op.id, task: input.task!, report: input.upload ?? null, permissionId,
      createdAt: new Date().toISOString(), transcript: "", receiptIds: [] as string[], status: "pending" as "pending" | "complete" | "unknown" };
    w.document.conversations.push(conversation);
    // Reserve paid-call budget before entering the external SDK (which has retries disabled).
    await transaction(c => spend(c,"model"));
    op.payload = { external: true, conversationId: conversation.id };
    await checkpoint(w,op,op.payload);
    try {
      const proposal = await proposeCalls(input);
      conversation.transcript = proposal.transcript;
      op.payload.calls = proposal.calls;
      await checkpoint(w,op,op.payload);
      for (const action of proposal.calls) {
        const receipt = await act({ action, mandateId: permissionId, agentId: AGENT_ID },"agent");
        conversation.receiptIds.push(receipt.id);
        await checkpoint(w,op,op.payload);
      }
      conversation.status = "complete";
    } catch (error) { conversation.status = "unknown"; throw error; }
  }));
});

workspaceRouter.post("/api/workspace/chat", async (req,res) => {
  const input = validateAgentInput({reportId:"clean",task:req.body?.task,...(req.body?.report ? {upload:req.body.report} : {})});
  if (!input.task) throw httpError(400,"Write a message before sending.");
  res.json(await perform(requestKey(req.get("Idempotency-Key")),"chat",input,async (w,op) => {
    if (!llmConfigured()) throw httpError(503,"Configure the Anthropic secret key to enable document chat.");
    if (w.document.conversations.length >= 100) throw httpError(429,"This workspace has reached its 100-message limit.");
    // User-initiated document chat has bounded daily usage, independent of chain approval.
    // Pending/unknown attempts count too; a restart or reset cannot refund calls.
    await transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock(9172404)");
      const count = (await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE workspace_id=$1)::int AS local FROM envoi_operations WHERE kind='chat' AND created_at > now()-interval '24 hours'",[w.id])).rows[0];
      if (count.local > 20 || count.total > 200) throw httpError(429,"Document chat has reached its daily limit (20 messages per workspace, 200 shared). Please try again tomorrow.");
    });
    const history = [...w.document.conversations];
    const conversation = {id:op.id,task:input.task!,report:input.upload ?? null,permissionId:"",createdAt:new Date().toISOString(),transcript:"",receiptIds:[] as string[],status:"pending" as "pending"|"complete"|"unknown"};
    w.document.conversations.push(conversation);
    w.document.draft.task = input.task!;
    w.document.draft.report = input.upload ?? null;
    op.payload = {external:true,conversationId:op.id};
    await checkpoint(w,op,op.payload);
    try {
      conversation.transcript = await chat(input.task!,input.upload ?? null,history);
      conversation.status = "complete";
    } catch(error) { conversation.status="unknown"; throw error; }
  }));
});

workspaceRouter.post("/api/workspace/reset", async (req,res) => {
  const id = requestKey(req.get("Idempotency-Key"));
  const w = workspace();
  await transaction(async c => {
    const locked = (await c.query("SELECT generation,active_operation FROM envoi_workspaces WHERE id=$1 FOR UPDATE",[w.id])).rows[0];
    const prior = (await c.query("SELECT workspace_id,kind FROM envoi_operations WHERE id=$1",[id])).rows[0];
    if (prior) {
      if (prior.workspace_id !== w.id || prior.kind !== "reset") throw httpError(409,"This request identifier was already used.");
      return;
    }
    if (locked.generation !== w.generation) throw httpError(409,"The workspace changed; reload first.");
    if (locked.active_operation) throw httpError(409,"An operation is active or unconfirmed. Check its status before resetting.");
    const doc = freshDocument(); doc.state.generation = w.generation + 1;
    await c.query("UPDATE envoi_operations SET status='unknown',detail='Workspace reset; external completion remains unconfirmed.' WHERE workspace_id=$1 AND status='pending'",[w.id]);
    await c.query("SELECT pg_advisory_xact_lock(9172402)");
    const counts = (await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE workspace_id=$1)::int AS local FROM envoi_operations",[w.id])).rows[0];
    if (counts.total >= 10000 || counts.local >= 500) throw httpError(429,"The retained operation limit has been reached.");
    await c.query("INSERT INTO envoi_operations(id,workspace_id,generation,kind,signature,status,detail,owner) VALUES($1,$2,$3,'reset','','complete','Workspace cleared; public records and usage reservations retained.',$4)",[id,w.id,w.generation,randomUUID()]);
    await c.query("UPDATE envoi_workspaces SET generation=generation+1,revision=revision+1,document=$2,active_operation=NULL WHERE id=$1",[w.id,JSON.stringify(doc)]);
  });
  res.json(await response(await load(w.id)));
});
// Recovery is read-only externally: never repeats signing, a paid call, or a broadcast.
workspaceRouter.post("/api/workspace/reconcile", async (req,res) => {
  requestKey(req.get("Idempotency-Key"));
  const id = requestKey(req.body?.operationId);
  const w = workspace();
  const op: Operation | undefined = (await pool.query("SELECT * FROM envoi_operations WHERE id=$1 AND workspace_id=$2",[id,w.id])).rows[0];
  if (!op) throw httpError(404,"This operation does not belong to this workspace.");
  if (op.status === "complete" || op.status === "failed") { res.json(await response(w)); return; }
  // A running request may still be updating its checkpoint; don't race its result commit.
  const newOwner = randomUUID();
  const aged = await pool.query("UPDATE envoi_operations SET owner=$2,updated_at=now() WHERE id=$1 AND owner=$3 AND updated_at < now()-interval '60 seconds' RETURNING id",[id,newOwner,op.owner]);
  if (!aged.rowCount) throw httpError(409,"The operation may still be running. Check again after one minute; no request was repeated.");
  op.owner = newOwner;
  const records = (await pool.query("SELECT * FROM envoi_broadcasts WHERE operation_id=$1",[id])).rows;
  if (op.kind === "chat" || op.kind === "draft") {
    const conversation = w.document.conversations.find(c=>c.id===op.id);
    const complete = op.payload?.phase === "ready";
    if (conversation && !complete) conversation.status="unknown";
    await finish(w,op,complete ? "complete" : "failed",complete ? "Saved outcome recovered; nothing was repeated." :
      op.kind === "chat" ? "No saved answer can be recovered; provider completion and charges remain unknown. This message is closed without retry. You may send a new message." :
        "The interrupted save is closed. Review the restored draft and save again if needed.");
    res.json(await response(await load(w.id))); return;
  }
  let unresolved = false;
  await state.withSnapshot(w.document.state, async () => {
    for (const record of records) {
      const result = await chain.reconcileFingerprint(record.fingerprint,record.tx_hash);
      if (result.status === "pending") { unresolved = true; continue; }
      if (op.generation !== w.generation) continue;
      if (op.kind === "sign" && op.payload?.slip && result.status === "recorded") {
        const slip = op.payload.slip as Slip;
        if (slip.digest !== record.fingerprint) throw httpError(409,"The saved permission does not match this public record.");
        slip.anchor = result.anchor;
        if (!state.getSlip(slip.mandate.mandateId)) state.addSlip(slip);
        op.payload.phase = "ready";
      }
      for (const receipt of state.listReceipts()) {
        const evidence = receipt.attemptEvidence;
        if (evidence && evidence.fingerprint === record.fingerprint && evidence.status === "pending") {
          const context = state.getRequestContext(receipt.id);
          if (!context) throw httpError(409,"Original request context is missing.");
          // Require the same post-request block ordering as the original recorder.
          const safeResult = result.status === "recorded" && result.anchor.blockNumber <= context.requestBlock.blockNumber
            ? {status: "failed" as const,anchor: null,txHash:record.tx_hash,detail:"The public record does not follow the original request."} : result;
          state.updateAttemptEvidence(receipt.id,{ record:evidence.record,fingerprint:evidence.fingerprint,...safeResult },w.generation);
        }
      }
    }
    if (op.generation !== w.generation) {
      if (records.length && !unresolved) await pool.query("UPDATE envoi_operations SET status='complete',detail='Public outcome checked; old workspace data was not restored.' WHERE id=$1",[id]);
      return;
    }
    const complete = op.payload?.phase === "ready" ||
      (op.kind === "act" && state.listReceipts().some(r => r.id === op.payload?.receiptId));
    if (complete && !unresolved) await finish(w,op,"complete","Recovered from durable evidence; nothing was repeated.");
    else {
      await checkpoint(w,op);
      await finish(w,op,"unknown","The original result cannot yet be established. No signing, AI call, or transaction was repeated. Retain this workspace and ask the operator to investigate.");
    }
  });
  res.json(await response(await load(w.id)));
});
return workspaceRouter;
}
export const workspaceRouter = createWorkspaceRouter();
