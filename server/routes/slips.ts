// POST /api/slips, POST /api/dispute (owner: P1).
import { Router } from "express";
import * as chain from "../chain";
import { createPermissionService } from "../chain/permission-service";
import { evaluate } from "../gateway/gateway";
import * as state from "../state";

export const slipsRouter = Router();
const permissions = createPermissionService({ state, chain, evaluate });
export { mondayNineNY } from "../chain/time";

slipsRouter.post("/api/slips", async (req, res) => {
  res.json(await permissions.issue(req.body?.scenarioId));
});

slipsRouter.post("/api/dispute", async (_req, res) => {
  res.json(await permissions.replayDispute());
});
