// One Express process: API + the Vite React client. No network calls at boot.
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { errorHandler } from "./http";
import { workspaceRouter } from "./routes/workspace";

const root = path.resolve(import.meta.dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5000;

const app = express();
app.use(express.json({ limit: "512kb" })); // Up to 60,000 uploaded Unicode characters.

// Route mounting (P3). Each router owns its own /api paths.
app.use(workspaceRouter);
// Legacy demo routes must not bypass durable sessions, quotas or operation journals.
app.use("/api", (_req, res) => {
  res.status(410).json({ error: "The demo API is retired. Use the persistent workspace interface; public spending tests are disabled." });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown API route." });
});
app.use(errorHandler);

const server = createServer(app);

if (isProd) {
  const dist = path.join(root, "dist/public");
  app.use(express.static(dist));
  // Anchor the relative file at the trusted build root. Absolute paths through
  // a managed .codex checkout otherwise trigger send's hidden-path rejection.
  app.use((_req, res) => res.sendFile("index.html", { root: dist }));
} else {
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    configFile: path.join(root, "vite.config.ts"),
    server: { middlewareMode: true, ws: { server }, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Envoi listening on :${port} (${isProd ? "production" : "dev"}, MOCK_CHAIN=${process.env.MOCK_CHAIN ?? "unset"})`);
});
