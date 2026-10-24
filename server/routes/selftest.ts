// GET /api/selftest (owner: P2). The team's integration test.
// STUB: P2 replaces this with the real scene-by-scene run from the envoi-bouncer skill.
import { Router } from "express";
import { httpError } from "../http";

export const selftestRouter = Router();

selftestRouter.get("/api/selftest", () => {
  throw httpError(501, "The self-test is not built yet.");
});
