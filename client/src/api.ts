// Thin fetch wrapper. Errors come back as { error: "plain sentence" }.
import type {
  ActRequest, AgentRunResponse, HealthResponse, Receipt, ReportId, SelftestResponse, Slip, StateResponse, UploadedReport,
} from "@shared/contract";
async function call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Could not reach the server.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // Older P1 scaffolding recommends enabling a practice chain. The live-only
    // client must report the missing integration, not suggest a simulated demo.
    const message = typeof json?.error === "string" ? json.error : "Something went wrong on the server.";
    throw new Error(message.replace(/\s*Set MOCK_CHAIN=1 to use the mock\.?/, ""));
  }
  return json as T;
}

// Always use the server. Query parameters must never substitute scripted results.
export const api = {
  state: () => call<StateResponse>("GET", "/api/state"),
  sign: (scenarioId: string) => call<Slip>("POST", "/api/slips", { scenarioId }),
  run: async (reportId: ReportId, upload?: UploadedReport) => {
    const result = await call<AgentRunResponse>("POST", "/api/agent/run", upload ? { reportId, upload } : { reportId });
    if (/^\s*\((stub|mock)\)/i.test(result.transcript)) {
      throw new Error("Atlas returned a scripted response; the live AI must be connected before this example can run.");
    }
    return result;
  },
  act: (req: ActRequest) => call<Receipt>("POST", "/api/act", req),
  dispute: () => call<Receipt>("POST", "/api/dispute"),
  reset: () => call<{ ok: true }>("POST", "/api/reset"),
  health: () => call<HealthResponse>("GET", "/api/health"),
  selftest: () => call<SelftestResponse>("GET", "/api/selftest"),
};

export type Api = typeof api;
