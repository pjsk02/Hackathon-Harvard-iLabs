// Isolated shared HTTP server for the two-browser test. Never mounted by the app.
import express from "express";
import type { AddressInfo } from "node:net";
import { createDemoGuard } from "../../server/demo-guard";
import { parseApiJson, errorHandler } from "../../server/http";
import { captureResetGeneration, stateRouter } from "../../server/routes/state";
import * as state from "../../server/state";
import { permission } from "./ui-harness";

export async function sharedApiHarness() {
  state.reset();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const grantStarted = new Promise<void>((resolve) => { started = resolve; });
  const app = express();
  app.use(parseApiJson());
  app.use("/api", createDemoGuard(), captureResetGeneration);
  app.get("/api/health", (_req, res) => res.json({
    ok: true, mockChain: false, issuer: permission.mandate.issuer, rpc: "https://test.invalid",
  }));
  app.use(stateRouter);
  app.post("/api/slips", async (_req, res) => {
    started();
    await wait;
    state.addSlip(structuredClone(permission));
    res.json(permission);
  });
  app.use("/api", (_req, res) => res.status(400).json({ error: "This route is not part of the isolated shared test." }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  if (!server.listening) await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    grantStarted, release,
    close: async () => {
      release();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
