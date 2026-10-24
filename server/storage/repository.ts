import pg from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import type { Conversation, Draft } from "../../shared/workspace";
import { emptySnapshot, type StateSnapshot } from "../state";
import { httpError } from "../http";
import type { TransactionBoard } from "../../shared/transactions";
import { operationCase } from "./transaction-model";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 4000, idleTimeoutMillis: 10000 });
export type Document = { state: StateSnapshot; draft: Draft; conversations: Conversation[]; board?: TransactionBoard };
export type Workspace = { id: string; generation: number; revision: number; document: Document; active_operation: string | null };
export type Operation = { id: string; workspace_id: string; generation: number; kind: string; signature: string; status: string; detail: string; payload: any; owner: string; reused?: boolean };
export const freshDocument = (): Document => ({
  state: emptySnapshot(), draft: { permissions: ["read_regional_margins"], task: "", report: null }, conversations: [],
});
export const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await work(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const session = new AsyncLocalStorage<Workspace>();
export const workspace = () => { const w = session.getStore(); if (!w) throw httpError(503, "A durable browser workspace is required."); return w; };
export const inWorkspace = <T>(w: Workspace, work: () => T) => session.run(w, work);
async function rateLimit(bucket: string, limit: number, seconds: number) {
  const result = await pool.query(`INSERT INTO envoi_rate_limits(bucket,count) VALUES($1,1)
    ON CONFLICT(bucket) DO UPDATE SET
      count=CASE WHEN envoi_rate_limits.window_start < now()-($2 * interval '1 second') THEN 1 ELSE envoi_rate_limits.count+1 END,
      window_start=CASE WHEN envoi_rate_limits.window_start < now()-($2 * interval '1 second') THEN now() ELSE envoi_rate_limits.window_start END
    RETURNING count`, [bucket,seconds]);
  if (result.rows[0].count > limit) throw httpError(429,"Too many requests. Please wait before trying again.");
}
export async function load(id: string): Promise<Workspace> {
  const result = await pool.query("SELECT * FROM envoi_workspaces WHERE id=$1 AND expires_at > now()", [id]);
  if (!result.rows[0]) throw httpError(410, "This anonymous workspace expired. Reload to open a new workspace.");
  return result.rows[0];
}
export const workspaceSession: RequestHandler = async (req, res, next) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.get("Origin");
      // Browser origin is mandatory on all mutations. Never trust forwarded host headers.
      if (!origin || new URL(origin).host !== req.get("Host") || !/^https?:$/.test(new URL(origin).protocol) ||
        req.get("Sec-Fetch-Site") === "cross-site" || !req.is("application/json")) {
        throw httpError(403, "Use this application's own page to change the workspace.");
      }
    }
    res.setHeader("Cache-Control", "no-store");
    if (!process.env.DATABASE_URL) throw httpError(503, "Durable storage is unavailable. Configure the managed PostgreSQL database.");
    await rateLimit("global", 6000, 60);
    const token = req.headers.cookie?.split(";").map(c => c.trim()).find(c => c.startsWith("__Host-envoi="))?.slice(13);
    let row: Workspace | undefined;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      row = (await pool.query("SELECT * FROM envoi_workspaces WHERE capability_hash=$1 AND expires_at > now()", [hash(token)])).rows[0];
    }
    if (!row) {
      if (req.method !== "GET") throw httpError(401, "Reload the page to establish your browser workspace.");
      await rateLimit("new-workspaces",100,3600);
      const secret = randomBytes(32).toString("hex");
      row = await transaction(async c => {
        await c.query("SELECT pg_advisory_xact_lock(9172401)");
        await c.query("DELETE FROM envoi_workspaces WHERE expires_at <= now()");
        await c.query("DELETE FROM envoi_rate_limits WHERE window_start < now()-interval '1 day' AND bucket NOT IN ('global','new-workspaces')");
        await c.query("UPDATE envoi_operations SET payload=NULL WHERE created_at < now()-interval '30 days' AND payload IS NOT NULL");
        const count = await c.query("SELECT count(*)::int AS n FROM envoi_workspaces");
        if (count.rows[0].n >= 1000) throw httpError(503, "Anonymous workspace capacity has been reached.");
        return (await c.query("INSERT INTO envoi_workspaces(id,capability_hash,document) VALUES($1,$2,$3) RETURNING *",
          [randomUUID(), hash(secret), JSON.stringify(freshDocument())])).rows[0];
      });
      res.cookie("__Host-envoi", secret, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 30 * 86400000 });
    }
    await rateLimit(`workspace:${row!.id}`,60,60);
    inWorkspace(row!, next);
  } catch (error) {
    next(error instanceof Error && "status" in error ? error : httpError(503, "Durable storage is unavailable. Check the database connection and development schema."));
  }
};
export async function budget(kind: "chain" | "model") {
  const r = await pool.query("SELECT approved,spent FROM envoi_budgets WHERE kind=$1", [kind]);
  return r.rows[0] as { approved: number; spent: number } | undefined;
}
export async function spend(c: pg.PoolClient, kind: "chain" | "model") {
  const r = await c.query("UPDATE envoi_budgets SET spent=spent+1 WHERE kind=$1 AND spent<approved RETURNING spent", [kind]);
  if (!r.rowCount) throw httpError(503, `The approved ${kind === "chain" ? "Monad transaction" : "AI call"} allowance is paused or exhausted. Ask the operator to approve a new total allowance; reset does not renew it.`);
}

export async function reserve(id: string, kind: string, input: unknown, transactionId?: unknown): Promise<Operation> {
  const w = workspace();
  return transaction(async c => {
    const locked = (await c.query("SELECT * FROM envoi_workspaces WHERE id=$1 FOR UPDATE", [w.id])).rows[0] as Workspace;
    if (!locked || locked.generation !== w.generation) throw httpError(409, "The workspace changed. Reload before continuing.");
    // Retain the signature of pre-board operations for safe same-key recovery.
    const signature = hash(JSON.stringify(transactionId===undefined ? [kind,input] : [kind,input,{transactionId}]));
    const prior = (await c.query("SELECT * FROM envoi_operations WHERE id=$1", [id])).rows[0] as Operation | undefined;
    if (prior) {
      if (prior.workspace_id !== w.id || prior.generation !== w.generation || prior.signature !== signature) throw httpError(409, "This request identifier was already used. Nothing was repeated.");
      return { ...prior, reused: true };
    }
    if (locked.active_operation) throw httpError(409, "An operation has an unconfirmed outcome. Check its status before making another change.");
    if (["sign","run","act","chat","submit"].includes(kind) && (await c.query("SELECT 1 FROM envoi_operations WHERE workspace_id=$1 AND status IN ('pending','unknown') LIMIT 1", [w.id])).rowCount) {
      throw httpError(409, "A previous operation remains unconfirmed, including after reset. Check its status; it will not be repeated.");
    }
    await c.query("SELECT pg_advisory_xact_lock(9172402)");
    const counts = (await c.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE workspace_id=$1)::int AS local FROM envoi_operations", [w.id])).rows[0];
    if (counts.total >= 10000 || counts.local >= 500) throw httpError(429, "The retained operation limit has been reached. Reset does not renew usage limits.");
    const hadBoard=!!locked.document.board;
    const selected=operationCase(locked.document,transactionId);
    if(!hadBoard) {
      const imported=locked.document.board!.cases.find(item=>item.provenance==="workspace" && item.title==="Previous workspace activity");
      if(imported) imported.operationIds=(await c.query("SELECT id FROM envoi_operations WHERE workspace_id=$1 AND generation=$2",[w.id,w.generation])).rows.map(row=>row.id);
    }
    selected.operationIds.push(id);
    if (kind === "chat" || kind === "run" || kind === "submit") selected.conversationIds.push(id);
    if (kind === "sign") selected.permissionIds.push(`permission-${id}`);
    const permissionId=(input as { permissionId?: unknown } | null)?.permissionId;
    if (typeof permissionId === "string" && !selected.permissionIds.includes(permissionId)) selected.permissionIds.push(permissionId);
    if (kind !== "draft") selected.status="in_progress";
    selected.updatedAt=new Date().toISOString(); selected.revision++;
    const op = (await c.query("INSERT INTO envoi_operations(id,workspace_id,generation,kind,signature,status,owner) VALUES($1,$2,$3,$4,$5,'pending',$6) RETURNING *", [id,w.id,w.generation,kind,signature,randomUUID()])).rows[0];
    // Save case association in the same transaction as the operation journal,
    // before any provider call or checkpoint can start.
    await c.query("UPDATE envoi_workspaces SET active_operation=$2,document=$3,revision=revision+1 WHERE id=$1", [w.id,id,JSON.stringify(locked.document)]);
    w.active_operation = id;
    // Use the locked revision, never overwrite edits made since session middleware loaded.
    w.document = locked.document; w.revision = locked.revision + 1;
    return op;
  });
}
export async function checkpoint(w: Workspace, op: Operation, payload?: unknown) {
  if (Buffer.byteLength(JSON.stringify(w.document)) > 2_000_000) throw httpError(413,"This workspace has reached its 2 MB retained-content limit. Export what you need before resetting.");
  await transaction(async c => {
    await c.query("SELECT id FROM envoi_workspaces WHERE id=$1 FOR UPDATE",[w.id]);
    const locked = await c.query("SELECT id FROM envoi_operations WHERE id=$1 AND owner=$2 FOR UPDATE",[op.id,op.owner]);
    if (!locked.rowCount) throw httpError(409,"Recovery took ownership of this operation. The old request cannot continue.");
    const result = await c.query("UPDATE envoi_workspaces SET document=$4,revision=revision+1 WHERE id=$1 AND generation=$2 AND active_operation=$3 RETURNING revision",
      [w.id, w.generation, op.id, JSON.stringify(w.document)]);
    if (!result.rowCount) throw httpError(409, "The workspace was reset. The old operation cannot change it.");
    if (payload !== undefined) await c.query("UPDATE envoi_operations SET payload=$2,updated_at=now() WHERE id=$1", [op.id, JSON.stringify(payload)]);
  });
}
export async function finish(w: Workspace, op: Operation, status: "complete" | "failed" | "unknown", detail: string) {
  await transaction(async c => {
    await c.query("SELECT id FROM envoi_workspaces WHERE id=$1 FOR UPDATE",[w.id]);
    const owned = await c.query("UPDATE envoi_operations SET status=$2,detail=$3,updated_at=now() WHERE id=$1 AND owner=$4 RETURNING id", [op.id,status,detail,op.owner]);
    if (!owned.rowCount) throw httpError(409,"Recovery took ownership of this operation.");
    await c.query("UPDATE envoi_workspaces SET document=$4,revision=revision+1,active_operation=$5 WHERE id=$1 AND generation=$2 AND active_operation=$3",
      [w.id,w.generation,op.id,JSON.stringify(w.document),status === "unknown" ? op.id : null]);
  });
}
export const activeExternal = new AsyncLocalStorage<{ op: Operation; checkpoint: () => Promise<void> }>();
