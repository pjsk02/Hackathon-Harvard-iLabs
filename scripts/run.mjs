// Node loads .env on Windows, macOS and Linux; tsx watches server code in dev.
// Set the mode before importing the existing server; owner code stays unchanged.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "development" && mode !== "production") {
  throw new Error("Choose development or production.");
}
process.env.NODE_ENV = mode;
if (mode === "production") {
  await import("../server/index.ts");
} else {
  // Pass an argument array: Windows shells must not include literal single quotes
  // in the ignore glob. tsx also ignores generated Vite files in node_modules.
  const child = spawn(process.execPath, [
    fileURLToPath(import.meta.resolve("tsx/cli")),
    "watch", "--clear-screen=false", "--ignore", "client/**", "server/index.ts",
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: process.env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(`Could not start development: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}
