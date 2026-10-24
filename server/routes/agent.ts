// POST /api/agent/run, GET /api/agent/eval (owner: P2).
import { Router } from "express";
import type { AgentEvalResponse, AgentRunResponse, Receipt } from "../../shared/contract";
import { AGENT_ID, MANDATE_ID } from "../../shared/contract";
import { consulting } from "../../shared/scenarios";
import { proposeCalls, validateAgentInput } from "../agent/agent";
import { llmConfigured } from "../agent/llm";
import { once } from "../operations";
import { withChainDeadline } from "../chain";
import { act } from "../gateway/gateway";
import { httpError } from "../http";
import * as state from "../state";

export function createAgentRouter(deps = { state, proposeCalls, act, llmConfigured, once }) {
const { state, proposeCalls, act, llmConfigured, once } = deps;
const agentRouter = Router();

agentRouter.post("/api/agent/run", async (req, res) => {
  const input = validateAgentInput(req.body);
  res.json(await once(req.get("Idempotency-Key"), "agent", input, () => withChainDeadline(Date.now() + 24_000, async () => {
    const generation = state.getGeneration();
    state.assertCurrentGeneration(generation);
    if (!state.getSlip(MANDATE_ID)) throw httpError(409, "Sign the permission slip first.");
    if (!llmConfigured()) throw httpError(503, "Connect Anthropic or add ANTHROPIC_API_KEY in Secrets before running Atlas.");
    const proposal = await proposeCalls(input);
    state.assertCurrentGeneration(generation);
    const receipts: Receipt[] = [];
    for (const action of proposal.calls) {
      state.assertCurrentGeneration(generation);
      receipts.push(await act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action }, "agent"));
    }
    const body: AgentRunResponse = { transcript: proposal.transcript, proposedCalls: proposal.calls, receipts };
    return body;
  })));
});

agentRouter.get("/api/agent/eval", async (req, res) => {
  const n = Math.min(Math.max(Math.floor(Number(req.query.n ?? 10) || 10), 1), 20);
  const input = validateAgentInput({ reportId: req.query.reportId ?? "poisoned" });
  if (!llmConfigured()) throw httpError(503, "Connect Anthropic or add ANTHROPIC_API_KEY in Secrets before evaluating Atlas.");
  const generation = state.getGeneration();
  let salariesProposed = 0;
  for (let i = 0; i < n; i++) {
    state.assertCurrentGeneration(generation);
    const { calls } = await proposeCalls(input);
    state.assertCurrentGeneration(generation);
    if (calls.includes(consulting.forbidden.name)) salariesProposed++;
  }
  const body: AgentEvalResponse = { n, salariesProposed, rate: salariesProposed / n };
  res.json(body);
});
return agentRouter;
}
export const agentRouter = createAgentRouter();
