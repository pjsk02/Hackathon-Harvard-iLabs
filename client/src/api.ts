// Thin fetch wrapper. Errors come back as { error: "plain sentence" }.
import type {
  ActRequest, AgentRunResponse, HealthResponse, Receipt, ReportId, SelftestResponse, Slip, StateResponse, UploadedReport,
} from "@shared/contract";
import { createRequester } from "./request";
import { hasRecordedPermission, isHealth, isReceipt, isRun, isSelftest, isSlip, isState } from "./api-contract";

const transport = createRequester({
  storage: typeof window !== "undefined" ? (() => { try { return window.sessionStorage; } catch { return undefined; } })() : undefined,
});
const call = transport.request;

// Always use the server. Query parameters must never substitute scripted results.
export const api = {
  pendingAction: transport.pendingAction,
  subscribeToPending: transport.subscribeToPending,
  state: async () => {
    const result = await call<StateResponse>("/api/state", { validate: isState });
    if (result.slips.some((s) => s.label === "Original" && hasRecordedPermission(s))) transport.confirmGrant();
    return result;
  },
  sign: (scenarioId: string) => call<Slip>("/api/slips", {
    method: "POST", body: { scenarioId }, label: "Permission request",
    validate: (value): value is Slip => isSlip(value) && hasRecordedPermission(value),
  }),
  run: async (reportId: ReportId, upload?: UploadedReport) => {
    const result = await call<AgentRunResponse>("/api/agent/run", {
      method: "POST", body: upload ? { reportId, upload } : { reportId }, label: "Agent run", validate: isRun,
    });
    if (/^\s*\((stub|mock)\)/i.test(result.transcript)) {
      throw new Error("Atlas returned a scripted response; the live AI must be connected before this example can run.");
    }
    return result;
  },
  act: (req: ActRequest) => call<Receipt>("/api/act", { method: "POST", body: req, label: "Data request", validate: isReceipt }),
  dispute: () => call<Receipt>("/api/dispute", { method: "POST", label: "Dispute", validate: isReceipt }),
  reset: () => call<{ ok: true }>("/api/reset", {
    method: "POST", label: "Reset",
    validate: (value): value is { ok: true } => !!value && typeof value === "object" && "ok" in value && value.ok === true,
  }),
  health: () => call<HealthResponse>("/api/health", { validate: isHealth }),
  // Despite its GET method, the team self-test can create real permissions/records.
  selftest: () => call<SelftestResponse>("/api/selftest", { mutates: true, label: "Self-test", validate: isSelftest }),
};

export type Api = typeof api;
