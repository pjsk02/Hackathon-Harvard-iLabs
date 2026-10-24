// POST /api/act (owner: P2). Forced request straight to the bouncer, no LLM.
import { Router } from "express";
import type { ActRequest } from "../../shared/contract";
import { act } from "../gateway/gateway";
import { httpError } from "../http";

export const actRouter = Router();

export function parseActRequest(body: unknown): ActRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "agentId, mandateId and action are required.");
  }
  const { agentId, mandateId, action } = body as Record<string, unknown>;
  const valid = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value;
  if (!valid(agentId) || !valid(mandateId) || !valid(action)) {
    throw httpError(400, "agentId, mandateId and action must be non-empty strings of at most 200 characters.");
  }
  return { agentId, mandateId, action };
}

actRouter.post("/api/act", async (req, res) => {
  res.json(await act(parseActRequest(req.body), "forced"));
});
