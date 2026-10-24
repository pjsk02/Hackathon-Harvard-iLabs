// GET is read-only. POST is an explicit, bounded four-transaction forced-path test.
import { Router } from "express";
import { httpError } from "../http";
import { AGENT_ID, MANDATE_ID, type SelftestResponse, type SelftestStep } from "../../shared/contract";
import { consulting } from "../../shared/scenarios";
import { budgetStatus, isMockChain, withChainDeadline } from "../chain";
import { act } from "../gateway/gateway";
import { permissions } from "./slips";
import * as state from "../state";

export function createSelftestRouter(deps = { state, budgetStatus, isMockChain, act, permissions }) {
const { state, budgetStatus, isMockChain, act, permissions } = deps;
const selftestRouter = Router();

selftestRouter.get("/api/selftest", (_req, res) => {
  res.json({ method: "POST", requiredTransactions: 4, executesAgent: false, ...budgetStatus() });
});

selftestRouter.post("/api/selftest", async (_req, res) => {
  const budget = budgetStatus();
  if (isMockChain()) throw httpError(409, "The self-test requires real Monad evidence, not practice mode.");
  if (budget.limit - budget.reserved < 4 || budget.pendingTxHash) {
    throw httpError(409, "The self-test needs approval for four unused Monad transactions and no unresolved transaction.");
  }
  if (state.listSlips().length || state.listReceipts().length) throw httpError(409, "The self-test needs an empty session. It will not reset existing evidence.");
  const generation = state.getGeneration();
  const steps: SelftestStep[] = [];
  let pass = true;
  await withChainDeadline(Date.now() + 30_000, async () => {
    const started = Date.now();
    try {
      await permissions.issue(consulting.id);
      state.assertCurrentGeneration(generation);
      steps.push({ scene: "Permission", expected: "Recorded", got: "Recorded", ms: Date.now() - started });
      for (const [action, decision] of [[consulting.allowed.name, "ALLOWED"], [consulting.forbidden.name, "BLOCKED"]] as const) {
        const at = Date.now();
        const receipt = await act({ agentId: AGENT_ID, mandateId: MANDATE_ID, action }, "forced");
        state.assertCurrentGeneration(generation);
        const okay = receipt.decision === decision && receipt.attemptEvidence?.status === "recorded" &&
          (decision === "ALLOWED" ? receipt.data !== null : receipt.data === null);
        steps.push({ scene: action, expected: `${decision}, recorded`, got: `${receipt.decision}, ${receipt.attemptEvidence?.status ?? "unrecorded"}`, ms: Date.now() - at });
        if (!okay) { pass = false; return; } // Never continue after unknown or failed evidence.
      }
      const at = Date.now();
      const dispute = await permissions.replayDispute();
      state.assertCurrentGeneration(generation);
      pass = dispute.decision === "REJECTED" && dispute.checks.filter((c) => !c.pass).map((c) => c.id).join() === "stamped";
      steps.push({ scene: "Dispute", expected: "REJECTED (late permission only)", got: dispute.decision, ms: Date.now() - at });
    } catch {
      state.assertCurrentGeneration(generation);
      pass = false;
      steps.push({ scene: "Stopped", expected: "Verified evidence", got: "Unconfirmed or failed; no additional steps were executed.", ms: Date.now() - started });
    }
  });
  const body: SelftestResponse = { pass, steps };
  res.json(body);
});
return selftestRouter;
}
export const selftestRouter = createSelftestRouter();
