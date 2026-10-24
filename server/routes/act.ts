// POST /api/act (owner: P2). Forced request straight to the bouncer, no LLM.
import { Router } from "express";
import type { ActRequest } from "../../shared/contract";
import { act } from "../gateway/gateway";
import { httpError } from "../http";
import { once } from "../operations";

export const actRouter = Router();

actRouter.post("/api/act", async (req, res) => {
  const { agentId, mandateId, action } = (req.body ?? {}) as Partial<ActRequest>;
  if (![agentId, mandateId, action].every((v) => typeof v === "string" && v.length > 0 && v.length <= 128)) {
    throw httpError(400, "agentId, mandateId and action must be short, non-empty strings.");
  }
  const input = { agentId: agentId!, mandateId: mandateId!, action: action! };
  res.json(await once(req.get("Idempotency-Key"), "act", input, () => act(input, "forced")));
});
