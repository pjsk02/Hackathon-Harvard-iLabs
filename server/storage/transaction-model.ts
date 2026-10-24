import { randomUUID } from "node:crypto";
import { EXAMPLES, type TransactionBoard, type TransactionCase } from "../../shared/transactions";
import type { Document } from "./repository";
import { httpError } from "../http";

export function newCase(id: string, title = "Untitled data review"): TransactionCase {
  const now = new Date().toISOString();
  return { id,title,scenario:"consulting",provenance:"workspace",status:"open",revision:0,
    createdAt:now,updatedAt:now,conversationIds:[],permissionIds:[],operationIds:[],receiptIds:[] };
}
/** The version marker makes legacy history import and illustrative seeds idempotent. */
export function ensureBoard(doc: Document): TransactionBoard {
  if (doc.board) return doc.board;
  const cases: TransactionCase[] = EXAMPLES.map(example => ({ ...newCase(example.id,example.title), ...example, provenance:"example" }));
  let activeId: string | null = null;
  if (doc.conversations.length || doc.state.slips.length || doc.state.receipts.length || doc.draft.task || doc.draft.report) {
    const imported = newCase(randomUUID(),"Previous workspace activity");
    imported.status=doc.conversations.length || doc.state.slips.length || doc.state.receipts.length ? "in_progress" : "open";
    imported.conversationIds=doc.conversations.map(c=>c.id);
    imported.permissionIds=doc.state.slips.map(s=>s.mandate.mandateId);
    imported.receiptIds=doc.state.receipts.map(r=>r.id);
    imported.draft=structuredClone(doc.draft);
    imported.createdAt=doc.conversations[0]?.createdAt ?? doc.state.receipts[0]?.createdAt ?? imported.createdAt;
    cases.push(imported); activeId=imported.id;
  }
  return doc.board={version:1,activeId,cases};
}
export function operationCase(doc: Document, requested: unknown): TransactionCase {
  const board=ensureBoard(doc);
  if (requested !== undefined && (typeof requested !== "string" || !/^[0-9a-f-]{36}$/i.test(requested))) throw httpError(400,"Choose a valid transaction from your board.");
  let selected=board.cases.find(c=>c.id===(requested ?? board.activeId) && c.provenance==="workspace");
  if (!selected && requested !== undefined) throw httpError(404,"This transaction does not belong to your workspace.");
  if (!selected) {
    if (board.cases.length >= 102) throw httpError(429,"This workspace has reached its 100-transaction limit.");
    selected=newCase(randomUUID()); board.cases.push(selected);
  }
  if (selected.status==="done") throw httpError(409,"Reopen this transaction on the board before adding activity.");
  if (selected.draft) doc.draft=structuredClone(selected.draft);
  board.activeId=selected.id;
  return selected;
}
