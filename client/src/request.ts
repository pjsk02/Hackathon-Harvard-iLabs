// Transport only: never retries a write or interprets a lost response as cancellation.
export type PendingAction = { path: string; label: string; phase: "waiting" | "unconfirmed"; sessionId?: string; idempotencyKey?: string };
export class ApiError extends Error {
  constructor(message: string, public outcomeUnknown = false) {
    super(message);
    this.name = "ApiError";
  }
}

type Options<T> = {
  method?: "GET" | "POST";
  body?: unknown;
  label?: string;
  mutates?: boolean;
  timeoutMs?: number;
  validate?: (value: unknown) => value is T;
  onSuccess?: (value: T, response: Response) => void;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const STORAGE_KEY = "envoi-unconfirmed-action";
const ACTIONS = new Set(["/api/slips", "/api/agent/run", "/api/act", "/api/dispute", "/api/reset", "/api/selftest", "/api/agent/eval"]);
const IDEMPOTENT_ACTIONS = new Set(["/api/agent/run", "/api/act"]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function plainError(message: string): string {
  return message
    .replace(/\s*Set MOCK_CHAIN=1 to use the mock\.?/, "")
    .replace(/\bTransaction:/gi, "Public record:")
    .replace(/\btransactions\b/gi, "records")
    .replace(/\btransaction\b/gi, "record")
    .replace(/\b0x[0-9a-f]{64}\b/gi, (value) => `${value.slice(0, 8)}…${value.slice(-6)}`)
    // Older owner branches can still return the previous product wording.
    // Classification below always uses the original message, not this copy.
    .replace(/\bJ\.?\s*T\.?[\s_-]*Morgan\b/gi, "Goldman Stanley")
    .replace(/\bBaine\b/gi, "McBain")
    .replace(/\blive demo\b/gi, "live workflow")
    .replace(/\bdemo\b/gi, "session");
}

export function createRequester({
  fetcher = (url, options) => fetch(url, options),
  storage,
  readTimeoutMs = 15_000,
  actionTimeoutMs = 90_000,
  getSessionId,
}: {
  fetcher?: typeof fetch;
  storage?: Store;
  readTimeoutMs?: number;
  actionTimeoutMs?: number;
  getSessionId?: () => string | null;
} = {}) {
  let pending: PendingAction | null = null;
  const listeners = new Set<() => void>();
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (saved && ACTIONS.has(saved.path) && typeof saved.label === "string") {
      pending = { path: saved.path, label: saved.label.slice(0, 80), phase: "unconfirmed" };
      if (typeof saved.sessionId === "string") pending.sessionId = saved.sessionId;
      if (typeof saved.idempotencyKey === "string" && UUID_V4.test(saved.idempotencyKey)) {
        pending.idempotencyKey = saved.idempotencyKey;
      }
    }
  } catch { /* Storage is optional; in-memory request guards still apply. */ }

  function publish(value: PendingAction | null) {
    pending = value;
    try {
      if (value) storage?.setItem(STORAGE_KEY, JSON.stringify(value));
      else storage?.removeItem(STORAGE_KEY);
    } catch { /* Some browsers disable session storage. Never retry a request for this. */ }
    listeners.forEach((listener) => listener());
  }

  async function request<T>(url: string, options: Options<T> = {}): Promise<T> {
    const method = options.method ?? "GET";
    const mutates = options.mutates ?? method === "POST";
    const previous = pending;
    if (mutates && pending && !(url === "/api/reset" && pending.phase === "unconfirmed")) {
      throw new ApiError("An earlier action is not confirmed; check its status before starting another.", true);
    }
    const sessionId = getSessionId?.();
    const action: PendingAction = { path: url, label: options.label ?? "Action", phase: "waiting", ...(sessionId ? { sessionId } : {}) };
    // Generate only after the existing concurrency guard, once per logical action.
    // Uncertain actions retain their identity in session storage; they are never automatically repeated.
    if (method === "POST" && IDEMPOTENT_ACTIONS.has(url)) action.idempotencyKey = crypto.randomUUID();
    if (mutates) publish(action);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? (mutates ? actionTimeoutMs : readTimeoutMs);
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiError("The server did not answer in time.", mutates));
        controller.abort();
      }, timeoutMs);
    });
    try {
      const { result, response } = await Promise.race([
        (async () => {
          const response = await fetcher(url, {
            method,
            headers: {
              ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
              ...(mutates && sessionId ? { "X-Envoi-Session": sessionId } : {}),
              ...(action.idempotencyKey ? { "Idempotency-Key": action.idempotencyKey } : {}),
            },
            credentials: "include",
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: controller.signal,
          });
          let json: unknown;
          try {
            json = await response.json();
          } catch {
            throw new ApiError("The server returned an unreadable response.", mutates);
          }
          if (!response.ok) {
            const raw = json && typeof json === "object" && "error" in json && typeof json.error === "string"
              ? json.error : "The server could not complete the request.";
            // This exact P2 error is emitted only around proposal generation,
            // before the first tool call. Generic AI/502 errors remain unknown.
            const preToolFailure = url === "/api/agent/run" && response.status === 502 &&
              raw === "The AI service did not answer. Use Force the request.";
            const setupFailure = (url === "/api/selftest" && response.status === 501 && raw === "The self-test is not built yet.") ||
              (url === "/api/slips" && /not built yet/i.test(raw)) ||
              (url === "/api/slips" && /^(ISSUER_PRIVATE_KEY.*(?:not set|missing|invalid)|Real Monad transactions are paused|The approved Monad test transaction limit has been reached)/i.test(raw));
            const refused = [400, 404, 413].includes(response.status) ||
              (url === "/api/reset" && response.status === 409) ||
              (response.status === 409 && /^(Another (?:demo action|request) is still being processed;|The shared (?:demo|session) changed;|Sign the permission slip first\.)/.test(raw)) ||
              (response.status === 429 && [
                "Too many demo actions; wait one minute before trying again.",
                "Too many requests; wait one minute before trying again.",
              ].includes(raw));
            throw new ApiError(plainError(raw), mutates && !preToolFailure && !setupFailure && !refused);
          }
          if (json === null || typeof json !== "object" || (options.validate && !options.validate(json))) {
            throw new ApiError("The server returned an incomplete response.", mutates);
          }
          return { result: json as T, response };
        })(),
        timeout,
      ]);
      options.onSuccess?.(result, response);
      if (mutates) publish(null);
      return result;
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError("Could not reach the server.", mutates);
      if (mutates) publish(error.outcomeUnknown ? { ...action, phase: "unconfirmed" } : previous);
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  }

  return {
    request,
    pendingAction: () => pending,
    subscribeToPending: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // Only an authoritative returned permission or confirmed Reset may clear recovery.
    confirmGrant: (sessionId?: string) => {
      if (pending?.path === "/api/slips" && pending.phase === "unconfirmed" &&
        (!getSessionId || (sessionId && pending.sessionId === sessionId))) publish(null);
    },
  };
}
