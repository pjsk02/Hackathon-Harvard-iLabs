// GET /api/state, POST /api/reset, GET /api/health (P3)
import { Router } from "express";
import type { RequestHandler } from "express";
import type { HealthResponse, ResetResponse, StateResponse } from "../../shared/contract";
import { DEFAULT_SCENARIO_ID, getScenario } from "../../shared/scenarios";
import * as state from "../state";
import { isMockChain, issuerAddressOrNull, rpcUrl } from "../chain";

export const stateRouter = Router();

export const captureResetGeneration: RequestHandler = (_req, _res, next) => {
  state.withResetGeneration(state.getResetGeneration(), next);
};

stateRouter.get("/api/state", (_req, res) => {
  const body: StateResponse = {
    scenario: getScenario(DEFAULT_SCENARIO_ID)!,
    slips: state.listSlips(),
    receipts: state.listReceipts(),
    counter: state.getCounter(),
  };
  res.json(body);
});

stateRouter.post("/api/reset", (_req, res) => {
  state.reset();
  const body: ResetResponse = { ok: true };
  res.json(body);
});

stateRouter.get("/api/health", (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    mockChain: isMockChain(),
    issuer: issuerAddressOrNull(),
    rpc: rpcUrl(),
  };
  res.json(body);
});
