// POST /api/slips, POST /api/dispute (owner: P1).
// Scaffold version: works end to end on the mock chain with the stub slip.ts.
import { Router } from "express";
import type { CreateSlipRequest, Receipt, Slip } from "../../shared/contract";
import { AMENDED_MANDATE_ID, MANDATE_ID } from "../../shared/contract";
import { getScenario } from "../../shared/scenarios";
import { anchor, latestTimestamp } from "../chain";
import { buildMandate, signMandate } from "../chain/slip";
import { evaluate } from "../gateway/gateway";
import { httpError } from "../http";
import * as state from "../state";

export const slipsRouter = Router();

slipsRouter.post("/api/slips", async (req, res) => {
  const { scenarioId } = (req.body ?? {}) as Partial<CreateSlipRequest>;
  const scenario = getScenario(scenarioId ?? "");
  if (!scenario) throw httpError(400, "Unknown scenario.");
  const mandate = buildMandate({ scenarioId: scenario.id, allowedActions: [scenario.allowed.name] });
  const { signature, digest } = await signMandate(mandate);
  const a = await anchor(digest);
  const slip: Slip = { mandate, signature, digest, label: "Original", anchor: a };
  state.addSlip(slip);
  res.json(slip);
});

slipsRouter.post("/api/dispute", async (_req, res) => {
  const blocked = state.listReceipts().find((r) => r.decision === "BLOCKED" && r.kind === "action");
  if (!blocked) throw httpError(409, "Run the hidden note scene first.");
  const original = state.getSlip(MANDATE_ID);
  if (!original) throw httpError(409, "Sign the permission slip first.");

  const mandate = {
    ...buildMandate({
      scenarioId: original.mandate.scenarioId,
      allowedActions: [...new Set([...original.mandate.allowedActions, blocked.action])],
      mandateId: AMENDED_MANDATE_ID,
      issuedAt: mondayNineNY(),
    }),
    expiresAt: original.mandate.expiresAt, // keep original expiry so "valid" passes
  };
  const { signature, digest } = await signMandate(mandate);

  // Wait until chain time has moved past the blocked request, or the stamp can tie it.
  while ((await latestTimestamp()) <= blocked.actionTime) await new Promise((r) => setTimeout(r, 400));
  const a = await anchor(digest);
  const amended: Slip = { mandate, signature, digest, label: "Amended", anchor: a };
  state.addSlip(amended);

  const checks = await evaluate(amended, blocked.action, blocked.actionTime, blocked.agentId);
  const receipt: Receipt = state.addReceipt({
    kind: "dispute",
    source: "forced",
    decision: checks.every((c) => c.pass) ? "ALLOWED" : "REJECTED",
    actionTime: blocked.actionTime,
    checks,
    data: null,
    agentId: blocked.agentId,
    mandateId: AMENDED_MANDATE_ID,
    action: blocked.action,
    explorerUrl: a.explorerUrl,
  });
  res.json(receipt);
});

/** Monday 9:00 AM New York time of the current week, in unix seconds (never in the future). */
export function mondayNineNY(nowSec = Math.floor(Date.now() / 1000)): number {
  const tz = "America/New_York";
  const parts = (ms: number) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
        .formatToParts(ms)
        .map((p) => [p.type, p.value]),
    );
  const p = parts(nowSec * 1000);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day - dow, 9, 0, 0);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const q = parts(t);
    t = guess - (Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second) - t);
  }
  const sec = Math.floor(t / 1000);
  return sec <= nowSec ? sec : sec - 7 * 86400;
}
