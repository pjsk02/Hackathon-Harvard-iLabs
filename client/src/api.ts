// Thin fetch wrapper. Errors come back as { error: "plain sentence" }.
import type {
  ActRequest, AgentRunResponse, HealthResponse, Receipt, ReportId, SelftestResponse, Slip, StateResponse, UploadedReport,
} from "@shared/contract";
import { ApiError, createRequester } from "./request";
import { hasRecordedPermission, isHealth, isReceipt, isRun, isSelftest, isSlip, isState } from "./api-contract";
import { demoPresentation } from "./demo-presentation";

const transport = createRequester({
  storage: typeof window !== "undefined" ? (() => { try { return window.sessionStorage; } catch { return undefined; } })() : undefined,
  getSessionId: () => demoPresentation.getSnapshot().sessionId,
});
const call = transport.request;

// Always use the server. Query parameters must never substitute scripted results.
export const api = {
  pendingAction: transport.pendingAction,
  subscribeToPending: transport.subscribeToPending,
  state: async () => {
    const result = await call<StateResponse>("/api/state", {
      validate: isState,
      onSuccess: (state, response) => {
        const sessionId = response.headers.get("X-Envoi-Session");
        if (!sessionId || !/^[a-z0-9-]{16,80}$/i.test(sessionId)) {
          throw new ApiError("The current session could not be identified; check status before submitting.");
        }
        demoPresentation.acceptState(sessionId, state, response.headers.get("X-Envoi-Operation") === "busy");
        if (state.slips.some((s) => s.label === "Original" && hasRecordedPermission(s))) transport.confirmGrant(sessionId);
      },
    });
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
    demoPresentation.completed(reportId, result.receipts);
    return result;
  },
  act: async (req: ActRequest) => {
    const receipt = await call<Receipt>("/api/act", {
      method: "POST", body: req, label: "Data request",
      validate: (value): value is Receipt => isReceipt(value) && value.source === "forced" && value.kind === "action",
    });
    demoPresentation.showReceipts([receipt]);
    return receipt;
  },
  dispute: async () => {
    const receipt = await call<Receipt>("/api/dispute", { method: "POST", label: "Dispute", validate: isReceipt });
    demoPresentation.showReceipts([receipt]);
    return receipt;
  },
  reconcile: (attemptId: string, receiptId: string) => call<Receipt>(`/api/attempts/${encodeURIComponent(attemptId)}/reconcile`, {
    method: "POST", mutates: false, label: "Read attempt status",
    validate: (value): value is Receipt => isReceipt(value) && value.id === receiptId,
  }),
  reset: () => call<{ ok: true }>("/api/reset", {
    method: "POST", label: "Reset",
    validate: (value): value is { ok: true } => !!value && typeof value === "object" && "ok" in value && value.ok === true,
  }),
  health: () => call<HealthResponse>("/api/health", { validate: isHealth }),
  // Explicitly manual, guarded write; GET /api/selftest is read-only.
  selftest: () => call<SelftestResponse>("/api/selftest", { method: "POST", label: "Self-test", validate: isSelftest }),
};

export type Api = typeof api;
