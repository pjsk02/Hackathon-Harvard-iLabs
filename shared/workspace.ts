import type { Slip, Receipt, UploadedReport } from "./contract";
import type { TransactionCase } from "./transactions";

export const ACTIONS = [
  { id: "read_regional_margins", label: "Regional profitability" },
  { id: "read_employee_salaries", label: "Employee compensation" },
  { id: "read_revenue", label: "Revenue" },
  { id: "read_operating_expenses", label: "Operating expenses" },
  { id: "read_customer_analytics", label: "Customer analytics" },
  { id: "read_risk_compliance", label: "Risk / compliance" },
] as const;
export type ActionId = typeof ACTIONS[number]["id"];
export const actionLabel = (id: string) => ACTIONS.find(a => a.id === id)?.label ?? id;
export function validSelection(value: unknown): value is ActionId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= ACTIONS.length &&
    new Set(value).size === value.length && value.every(id => ACTIONS.some(a => a.id === id));
}
export type Draft = { permissions: ActionId[]; task: string; report: UploadedReport | null };
export type Conversation = {
  id: string; task: string; report: UploadedReport | null; permissionId: string;
  createdAt: string; transcript: string; receiptIds: string[]; status: "pending" | "complete" | "unknown";
};
export type OperationSummary = { id: string; kind: string; status: string; detail: string };
export type WorkspaceResponse = {
  generation: number; draft: Draft; conversations: Conversation[]; slips: Slip[]; receipts: Receipt[];
  operations: OperationSummary[];
  availability: { signing: boolean; agent: boolean; chat?: boolean; detail: string };
  currentTransaction?: TransactionCase | null;
};
