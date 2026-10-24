import { Router } from "express";
import { UUID_PATTERN } from "../../shared/attempt-record";
import { attempts } from "../gateway/gateway";
import { httpError } from "../http";

export const attemptsRouter = Router();
attemptsRouter.post("/api/attempts/:attemptId/reconcile", async (req, res) => {
  const id = req.params.attemptId;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw httpError(400, "Choose a valid attempt identifier.");
  res.json(await attempts.reconcile(id.toLowerCase()));
});
