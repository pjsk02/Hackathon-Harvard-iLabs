// POST /api/act (owner: P2). Forced request straight to the bouncer, no LLM.
import { Router } from "express";
import type { ActRequest } from "../../shared/contract";
import { act } from "../gateway/gateway";
import { httpError } from "../http";

export const actRouter = Router();

actRouter.post("/api/act", async (req, res) => {
  const { agentId, mandateId, action } = (req.body ?? {}) as Partial<ActRequest>;
  if (!agentId || !mandateId || !action) throw httpError(400, "agentId, mandateId and action are required.");
  res.json(await act({ agentId, mandateId, action }, "forced"));
});
