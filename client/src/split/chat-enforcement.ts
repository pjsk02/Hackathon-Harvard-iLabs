import type { Conversation } from "@shared/workspace";
import type { Receipt } from "@shared/contract";

const sameRequest = (a: Conversation, b: Conversation) => a.task === b.task &&
  a.report?.fileName === b.report?.fileName && a.report?.text === b.report?.text;

export function chatEnforcement(message: Conversation, conversations: Conversation[], receipts: Receipt[]) {
  if(message.mode==="document")return {state:"document" as const,run:message,text:"Document chat only · no protected-data access",action:"View request"};
  if(message.mode==="enforced" && (!message.permissionId || message.enforcement?.status==="unknown" || message.enforcement?.status==="unavailable"))return {
    state:"pending" as const,run:message,text:message.enforcement?.detail ?? "Permission enforcement is not confirmed",action:"View request",
  };
  let run: Conversation | undefined = message.permissionId ? message : undefined;
  // A repeated message starts a new request. Never borrow an earlier result or
  // evidence belonging to the next identical chat message.
  if (!run) {
    const index = conversations.findIndex(item => item.id === message.id);
    if (index >= 0) for (const item of conversations.slice(index + 1)) {
      if (!sameRequest(message, item)) continue;
      if (!item.permissionId) break;
      run = item;
    }
  }
  if (!run) return { state: "not-run" as const, run: message, text: "No saved permission enforcement", action: "View request" };
  if (run.status !== "complete") return {
    state: "pending" as const, run,
    text: run.status === "pending" ? "Enforcement in progress" : "Enforcement outcome unknown",
    action: "View enforcement",
  };
  if (!run.receiptIds.length) return { state: "no-access" as const, run, text: "No protected-data access requested", action: "View enforcement" };
  const matched = run.receiptIds.map(id => receipts.find(receipt =>
    receipt.id === id && receipt.mandateId === run!.permissionId && receipt.source === "agent"));
  if (matched.some(receipt => !receipt || receipt.checks.length !== 5)) {
    return { state: "pending" as const, run, text: "Enforcement evidence unavailable", action: "View enforcement" };
  }
  const blocked = matched.some(receipt => receipt!.decision === "BLOCKED");
  return { state: blocked ? "blocked" as const : "allowed" as const, run,
    text: `Permission slip enforced · ${blocked ? "Blocked access" : "Within scope"}`, action: "View enforcement" };
}
