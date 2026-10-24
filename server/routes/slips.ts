// POST /api/slips, POST /api/dispute (owner: P1).
import { Router } from "express";
import type { CreateSlipRequest, Receipt, Slip } from "../../shared/contract";
import { AMENDED_MANDATE_ID } from "../../shared/contract";
import { getScenario } from "../../shared/scenarios";
import { anchor, latestTimestamp } from "../chain";
import { buildMandate, signMandate } from "../chain/slip";
import { ChainError } from "../chain/rpc";
import { evaluate } from "../gateway/gateway";
import { httpError } from "../http";
import * as state from "../state";

export const slipsRouter = Router();
let operationRunning = false;

async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  if (operationRunning) throw httpError(409, "A permission operation is already running.");
  operationRunning = true;
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ChainError) {
      const reference = error.txHash ? ` Transaction: ${error.txHash}. Retry to check the same stamp.` : "";
      throw httpError(503, `${error.message}${reference}`);
    }
    // Only P1-owned safe messages are propagated; provider bodies never reach the UI.
    if (error instanceof Error && error.message.startsWith("ISSUER_PRIVATE_KEY")) {
      throw httpError(503, error.message);
    }
    throw error;
  } finally {
    operationRunning = false;
  }
}

slipsRouter.post("/api/slips", async (req, res) => {
  const slip = await exclusive(async () => {
  const { scenarioId } = (req.body ?? {}) as Partial<CreateSlipRequest>;
  if (typeof scenarioId !== "string") throw httpError(400, "Choose a valid scenario.");
  const scenario = getScenario(scenarioId ?? "");
  if (!scenario || scenario.id !== scenarioId) throw httpError(400, "Unknown scenario.");
  const issuedAt = await latestTimestamp();
  const mandate = buildMandate({ scenarioId: scenario.id, allowedActions: [scenario.allowed.name], issuedAt });
  const { signature, digest } = await signMandate(mandate);
  const a = await anchor(digest);
  const slip: Slip = { mandate, signature, digest, label: "Original", anchor: a };
  state.addSlip(slip);
  return slip;
  });
  res.json(slip);
});

slipsRouter.post("/api/dispute", async (_req, res) => {
  const receipt = await exclusive(async () => {
  const blocked = state.listReceipts().find((r) => r.decision === "BLOCKED" && r.kind === "action");
  if (!blocked) throw httpError(409, "Run the hidden note scene first.");
  const original = state.getSlip(blocked.mandateId);
  if (!original) throw httpError(409, "Sign the permission slip first.");

  const mandate = {
    ...buildMandate({
      scenarioId: original.mandate.scenarioId,
      allowedActions: [...new Set([...original.mandate.allowedActions, blocked.action])],
      mandateId: AMENDED_MANDATE_ID,
      issuedAt: mondayNineNY(blocked.actionTime),
      expiresAt: original.mandate.expiresAt,
    }),
    expiresAt: original.mandate.expiresAt, // keep original expiry so "valid" passes
  };
  const { signature, digest } = await signMandate(mandate);

  // Compatibility with P2's current timestamp evaluator, NOT a substitute for block ordering.
  // Bounded so an RPC outage or frozen mock cannot hang this route indefinitely.
  const deadline = Date.now() + 5000;
  while ((await latestTimestamp()) <= blocked.actionTime) {
    if (Date.now() >= deadline) throw httpError(503, "Monad has not advanced past this request. Retry the dispute.");
    await new Promise((r) => setTimeout(r, 250));
  }
  const a = await anchor(digest);
  if (state.getSlip(blocked.mandateId) !== original || state.getReceipt(blocked.id) !== blocked) {
    throw httpError(409, "The session changed. Run the hidden note scene again.");
  }
  const amended: Slip = { mandate, signature, digest, label: "Amended", anchor: a };
  state.addSlip(amended);

  const checks = await evaluate(amended, blocked.action, blocked.actionTime, blocked.agentId);
  if (state.getReceipt(blocked.id) !== blocked) throw httpError(409, "The session changed. Run the hidden note scene again.");
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
  return receipt;
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
  const inNewYork = (localGuess: number) => {
    let t = localGuess;
    for (let i = 0; i < 3; i++) {
      const q = parts(t);
      t = localGuess - (Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second) - t);
    }
    return Math.floor(t / 1000);
  };
  const sec = inNewYork(guess);
  // Subtract a calendar week before resolving the timezone, not 168 hours across DST.
  return sec <= nowSec ? sec : inNewYork(guess - 7 * 86400_000);
}
