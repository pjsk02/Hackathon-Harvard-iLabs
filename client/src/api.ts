// Thin fetch wrapper. Errors come back as { error: "plain sentence" }.
import type {
  ActRequest, AgentRunResponse, Receipt, ReportId, Slip, StateResponse,
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
  if (!res.ok) throw new Error(json?.error ?? "Something went wrong on the server.");
  return json as T;
}

export const api = {
  state: () => call<StateResponse>("GET", "/api/state"),
  sign: (scenarioId: string) => call<Slip>("POST", "/api/slips", { scenarioId }),
  run: (reportId: ReportId) => call<AgentRunResponse>("POST", "/api/agent/run", { reportId }),
  act: (req: ActRequest) => call<Receipt>("POST", "/api/act", req),
  dispute: () => call<Receipt>("POST", "/api/dispute"),
  reset: () => call<{ ok: true }>("POST", "/api/reset"),
};
