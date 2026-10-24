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
  res.status(500).json({ error: "Something went wrong on the server." });
};
