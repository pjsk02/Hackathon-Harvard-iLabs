// P3 HTTP boundary for the single shared demo. No queue, automatic retry or
// cancellation claim: a second visitor must wait and explicitly check again.
import type { RequestHandler, Response } from "express";
import * as state from "./state";

export const SESSION_HEADER = "X-Envoi-Session";
export const OPERATION_HEADER = "X-Envoi-Operation";
export const BUSY_MESSAGE = "Another request is still being processed; check status before trying again.";
export const STALE_MESSAGE = "The shared session changed; check status before starting this action.";

export function createDemoGuard({ maxPerMinute = 20, now = Date.now } = {}) {
  let active = false;
  let starts: number[] = [];
  const middleware: RequestHandler = (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set(SESSION_HEADER, state.getSessionId());
    res.set(OPERATION_HEADER, active ? "busy" : "idle");
    const mutates = !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      ["/selftest", "/agent/eval"].includes(req.path);
    if (!mutates) { next(); return; }
    if (active) { res.status(409).json({ error: BUSY_MESSAGE }); return; }

    // Existing team scripts remain compatible without a header. The browser
    // always supplies its last authoritative session so stale tabs fail closed.
    const observedSession = req.get(SESSION_HEADER);
    if (observedSession && observedSession !== state.getSessionId()) {
      res.status(409).json({ error: STALE_MESSAGE });
      return;
    }
    const time = now();
    starts = starts.filter((started) => time - started < 60_000);
    // Preserve a recovery path. Reset cannot run during work, but is not
    // throttled once that work has settled.
    if (req.path !== "/reset") {
      if (starts.length >= maxPerMinute) {
        res.set("Retry-After", "60");
        res.status(429).json({ error: "Too many requests; wait one minute before trying again." });
        return;
      }
      starts.push(time);
    }
    active = true;
    const end = res.end;
    // A socket close is NOT completion: the route can still be using the model
    // or sending to Monad. Release only when its response is actually ended,
    // including an error response after the async handler has settled.
    res.end = function (this: Response, ...args: Parameters<Response["end"]>) {
      try { return end.apply(this, args); }
      finally { active = false; }
    } as Response["end"];
    next();
  };
  return middleware;
}
