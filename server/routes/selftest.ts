// P2: preserve the already-mounted name/path. No loopback requests or shared reset.
import { Router } from "express";
import { HttpError, httpError } from "../http";
import { runSelftest, type SceneClient, type SelftestEvidence } from "../gateway/selftest-runner";

export { runSelftest } from "../gateway/selftest-runner";

export const ISOLATION_UNAVAILABLE =
  "Self-test is unavailable: an approved isolated state adapter has not been integrated; the shared demo will not be reset.";

// Trusted in-process injection only. No request header/query/body can choose this.
// The factory is deliberately absent from the mounted production router. A marker,
// a detached parent response, or a snapshot/restore of shared state is not isolation.
export type SelftestSession = {
  client: SceneClient;
  evidence: SelftestEvidence;
  close(): Promise<void>;
};
type Options = {
  createIsolatedSession?: (signal: AbortSignal) => Promise<SelftestSession>;
  maximumMs?: number;
};

export function createSelftestRouter({ createIsolatedSession, maximumMs = 30_000 }: Options = {}) {
  if (!Number.isSafeInteger(maximumMs) || maximumMs < 1 || maximumMs > 120_000) {
    throw new Error("Invalid self-test deadline.");
  }
  const router = Router();
  let running = false;
  router.get("/api/selftest", async (_req, res) => {
    if (running) throw httpError(409, "A self-test is already running; its operations must settle before another run.");
    if (!createIsolatedSession) throw httpError(503, ISOLATION_UNAVAILABLE);
    running = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A deadline ends the HTTP wait, NOT a broadcast or child operation. Keep the
    // lock until all work AND cleanup settle; do not admit a second sender early.
    const work = (async () => {
      let session: SelftestSession | undefined;
      try {
        session = await createIsolatedSession(controller.signal);
        if (controller.signal.aborted) throw httpError(504, "The self-test verification deadline was exceeded.");
        res.setHeader("X-Envoi-Selftest-Mode", session.evidence);
        return await runSelftest(session.client, session.evidence, controller.signal);
      } finally {
        try { await session?.close(); } finally { running = false; }
      }
    })();
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(httpError(504, "The self-test deadline was exceeded; pending operations must settle before retrying."));
        }, maximumMs);
      });
      const result = await Promise.race([work, timeout]);
      res.json(result);
    } catch (error) {
      if (error instanceof HttpError && error.status === 504) {
        throw httpError(504, "The self-test deadline was exceeded; pending operations must settle before retrying.");
      }
      if (error instanceof HttpError && error.status === 409) {
        throw httpError(409, "The isolated self-test session changed; start a new run after its operations settle.");
      }
      throw httpError(503, "The isolated self-test session could not be prepared or released safely.");
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
  return router;
}

export const selftestRouter = createSelftestRouter();
