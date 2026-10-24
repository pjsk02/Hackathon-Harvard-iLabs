// One Express process: API + the Vite React client. No network calls at boot.
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { errorHandler } from "./http";
import { captureResetGeneration, stateRouter } from "./routes/state";
import { slipsRouter } from "./routes/slips";
import { actRouter } from "./routes/act";
import { agentRouter } from "./routes/agent";
import { selftestRouter } from "./routes/selftest";
import { attemptsRouter } from "./routes/attempts";

const root = path.resolve(import.meta.dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5000;

const app = express();
app.use(express.json({ limit: "512kb" })); // Up to 60,000 uploaded Unicode characters.

// Route mounting (P3). Each router owns its own /api paths.
app.use("/api", captureResetGeneration);
app.use(stateRouter);
app.use(slipsRouter);
app.use(actRouter);
app.use(agentRouter);
app.use(selftestRouter);
app.use(attemptsRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown API route." });
});
app.use(errorHandler);

const server = createServer(app);

if (isProd) {
  const dist = path.join(root, "dist/public");
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    configFile: path.join(root, "vite.config.ts"),
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Envoi listening on :${port} (${isProd ? "production" : "dev"}, MOCK_CHAIN=${process.env.MOCK_CHAIN ?? "unset"})`);
});
