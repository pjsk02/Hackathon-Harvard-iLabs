// Discover tests without shell globs and scope fixture settings to the child.
// These settings never enable mock mode in the application or load local secrets.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const directories = ["server/agent/tests", "server/gateway/tests", "server/data/tests"];
const files = directories.flatMap((directory) =>
  readdirSync(path.join(root, directory))
    .filter((name) => name.endsWith(".test.ts"))
    .sort()
    .map((name) => path.join(directory, name)),
);
const env = {
  ...process.env,
  MOCK_CHAIN: "1",
  MONAD_MAX_TRANSACTIONS: "0",
  ENVOI_LIVE_MODEL_SMOKE: "0",
};
for (const name of [
  "ISSUER_PRIVATE_KEY", "MONAD_RPC_URL", "ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY", "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
]) delete env[name];

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root, env, stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
