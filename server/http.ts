// Errors are always { error: "plain sentence" } with a 4xx/5xx status.
import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const httpError = (status: number, message: string) => new HttpError(status, message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "The request body was not valid JSON." });
    return;
  }
  console.error(err);
  // Chain problems have plain-sentence messages worth showing on the pre-flight panel.
  const msg: string = err?.message ?? "";
  if (/ISSUER_PRIVATE_KEY is not set/.test(msg)) {
    res.status(503).json({ error: "No signing key. Add the ISSUER_PRIVATE_KEY secret." });
    return;
  }
  if (/Monad|insufficient funds/i.test(msg)) {
    res.status(502).json({ error: /insufficient funds/i.test(msg) ? "The signing wallet has no test MON left. Use the Monad faucet." : msg.split("\n")[0].slice(0, 160) });
    return;
  }
  res.status(500).json({ error: "Something went wrong on the server." });
};
