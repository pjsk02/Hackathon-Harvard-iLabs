import type { PendingAction } from "./request";
import type { ConnectionStatus } from "./health-status";
import "./request-feedback.css";

export type { ConnectionStatus } from "./health-status";

export type RequestFeedbackProps = {
  connection: ConnectionStatus;
  pending: PendingAction | null;
  error: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  busy: boolean;
};

// Keep unexpected browser/server diagnostics out of the demo.
export function plainRequestError(error: unknown): string {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!message.trim() || /[\r\n]|<\/?[a-z]|(?:Error:|TypeError|SyntaxError)|\b(?:stack|nonce|digest|gateway|mandate|EIP-712)\b/i.test(message)) {
    return "The request could not be confirmed. Check status before trying again.";
  }
  return message.trim();
}

export default function RequestFeedback({ connection, pending, error, onRecheck, rechecking, busy }: RequestFeedbackProps) {
  const waiting = pending?.phase === "waiting";
  const unconfirmed = pending?.phase === "unconfirmed";
  const title = waiting ? "Waiting for confirmation"
    : unconfirmed ? "Outcome not confirmed"
    : connection.state === "checking" ? "Checking server"
    : connection.state === "verified" ? "Signing verified · Monad connected"
    : connection.state === "unavailable" ? "Readiness unavailable" : "Server status";

  return (
    <section className="request-feedback" aria-label="Request and connection status" data-connection-state={connection.state}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="request-feedback-title">{title}</p>
        {pending ? (
          <>
            <p>{pending.label}: {waiting ? "waiting for the server to respond." : "the connection ended before confirmation."}</p>
            {unconfirmed && <p>Submitted work may still complete. It has not been retried. Check status before trying again.</p>}
            <p>A timeout or Reset does not cancel work already submitted to Monad.</p>
          </>
        ) : <p>{connection.message}</p>}
      </div>
      {error && <p className="request-feedback-error" role="alert">{plainRequestError(error)}</p>}
      <div className="request-feedback-actions">
        <button type="button" className="ghost" data-testid="check-status" onClick={onRecheck}
          disabled={busy || rechecking || waiting}>
          {rechecking ? "Checking status…" : "Check status"}
        </button>
        <a href="/?preflight=1" aria-disabled={busy || rechecking || waiting}
          tabIndex={busy || rechecking || waiting ? -1 : undefined}
          onClick={(event) => { if (busy || rechecking || waiting) event.preventDefault(); }}>Open pre-flight</a>
      </div>
    </section>
  );
}
