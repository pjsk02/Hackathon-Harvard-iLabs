// Thin fetch wrapper. Errors come back as { error: "plain sentence" }.
import type {
  ActRequest, AgentRunResponse, Receipt, ReportId, Slip, StateResponse,
} from "@shared/contract";
import { mockApi } from "./mock";

/** /?mock=1 runs every beat in the browser with no server logic (MOCK badge shows). */
export const isMock = new URLSearchParams(window.location.search).get("mock") === "1";

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

const realApi = {
  state: () => call<StateResponse>("GET", "/api/state"),
  sign: (scenarioId: string) => call<Slip>("POST", "/api/slips", { scenarioId }),
  run: (reportId: ReportId) => call<AgentRunResponse>("POST", "/api/agent/run", { reportId }),
  act: (req: ActRequest) => call<Receipt>("POST", "/api/act", req),
  dispute: () => call<Receipt>("POST", "/api/dispute"),
  reset: () => call<{ ok: true }>("POST", "/api/reset"),
};

export type Api = typeof realApi;
export const api: Api = isMock ? mockApi : realApi;
