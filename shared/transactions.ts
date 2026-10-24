import type { Draft } from "./workspace";
export type CaseStatus = "open" | "in_progress" | "done";
export type CaseScenario = "consulting" | "chargeback";
export type TransactionCase = {
  id: string; title: string; scenario: CaseScenario; provenance: "example" | "workspace";
  status: CaseStatus; revision: number; createdAt: string; updatedAt: string;
  conversationIds: string[]; permissionIds: string[]; operationIds: string[]; receiptIds: string[];
  draft?: Draft;
};
export type TransactionBoard = { version: 1; activeId: string | null; cases: TransactionCase[] };
export type CaseSummary = Omit<TransactionCase, "conversationIds" | "permissionIds" | "operationIds" | "receiptIds" | "draft"> & {
  parties: string; pending: boolean; decisions: string[];
};
export type CaseDetail = CaseSummary & {
  timeline: { at: string; title: string; detail: string }[];
  records: { kind: "permission" | "request"; reference: string; url: string }[];
  checklist: string[]; conversationCount: number;
};
export type BoardResponse = { cases: CaseSummary[]; activeId: string | null };
export const CASE_STATUS: Record<CaseStatus,string> = { open:"Open", in_progress:"In progress", done:"Done" };
export const CASE_SCENARIO: Record<CaseScenario,string> = { consulting:"Permissioned data review", chargeback:"Chargeback evidence review" };
export const CASE_PARTIES: Record<CaseScenario,string> = { consulting:"Goldman Stanley ↔ McBain", chargeback:"Walmart ↔ Cardholder’s bank" };
export const EXAMPLES = [
  { id:"example-consulting", title:"Regional profitability review", scenario:"consulting", status:"done" },
  { id:"example-chargeback", title:"Chargeback evidence review", scenario:"chargeback", status:"in_progress" },
] as const;
