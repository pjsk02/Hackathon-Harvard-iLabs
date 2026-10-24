// STUB-ISH (owner: P2). act(): checks, then data only on a full pass, then a receipt.
// This is the ONLY file allowed to import server/data.
import type { ActRequest, Receipt } from "../../shared/contract";
import { DATA } from "../data/northwind";
import { latestTimestamp } from "../chain";
import { httpError } from "../http";
import * as state from "../state";
import { evaluate } from "./checks";

export { evaluate };

export async function act(req: ActRequest, source: "agent" | "forced"): Promise<Receipt> {
  const slip = state.getSlip(req.mandateId);
  if (!slip) throw httpError(404, "No permission slip yet. Click Sign and stamp first.");
  const actionTime = await latestTimestamp(); // chain time, not server time
  const checks = await evaluate(slip, req.action, actionTime, req.agentId);
  const ok = checks.every((c) => c.pass);
  const fn = DATA[req.action as keyof typeof DATA];
  const data = ok && fn ? fn() : null;
  return state.addReceipt({
    kind: "action",
    source,
    decision: ok ? "ALLOWED" : "BLOCKED",
    actionTime,
    checks,
    data,
    agentId: req.agentId,
    mandateId: req.mandateId,
    action: req.action,
    explorerUrl: slip.anchor?.explorerUrl ?? null,
  });
}
