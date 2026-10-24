// Errors are always { error: "plain sentence" } with a 4xx/5xx status.
import type { ErrorRequestHandler, RequestHandler } from "express";
import express from "express";

// 60,000 UTF-16 units can take up to 360,000 bytes after JSON escaping.
// The file itself is extracted in the browser; it is not uploaded as binary.
export const API_JSON_LIMIT_BYTES = 512 * 1024;
export const parseApiJson = () => express.json({ limit: API_JSON_LIMIT_BYTES });

/** Transport validation only; P2 still owns passing this text to the real model. */
export const validateReportBody: RequestHandler = (req, _res, next) => {
  if (req.method === "POST" && req.path === "/agent/run" && req.body?.upload !== undefined) {
    const upload = req.body.upload;
    if (!upload || typeof upload.fileName !== "string" || typeof upload.text !== "string") {
      next(httpError(400, "Upload a report with a file name and readable text."));
      return;
    }
    if (!/\.(docx|txt|md|html?)$/i.test(upload.fileName) || upload.fileName.length > 255) {
      next(httpError(400, "Use a supported report file with a name no longer than 255 characters."));
      return;
    }
    if (upload.text.length > 60_000) {
      next(httpError(413, "Choose a report with no more than 60,000 characters."));
      return;
    }
    if (!upload.text.trim()) {
      next(httpError(400, "That file has no readable text."));
      return;
    }
  }
  next();
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const httpError = (status: number, message: string) => new HttpError(status, message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "That report request is too large; choose a file up to 5 MB with no more than 60,000 extracted characters." });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "The request body was not valid JSON." });
    return;
  }
  // Unknown provider errors may contain credentials or report text.
  console.error("Unhandled request error");
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
