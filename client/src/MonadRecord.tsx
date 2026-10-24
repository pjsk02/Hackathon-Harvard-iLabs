import type { Anchor } from "@shared/contract";
import { time } from "./labels";

export const shortTransaction = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

/** Only pass an anchor returned by recordedAnchor or attemptEvidence. Never infer a link. */
export default function MonadRecord({ anchor, label }: { anchor: Anchor; label: string }) {
  return (
    <div className="record-proof">
      <dl className="record-proof-facts">
        <dt>Confirmed block</dt><dd>{anchor.blockNumber.toLocaleString()}</dd>
        <dt>Transaction ID</dt><dd><code>{shortTransaction(anchor.txHash)}</code></dd>
      </dl>
      <a className="monad-record-link" href={anchor.explorerUrl} target="_blank" rel="noopener noreferrer"
        aria-label={`View ${label} on Monad (opens in a new tab)`}>
        View on Monad <span aria-hidden="true">↗</span>
        <span className="record-new-tab">Opens in a new tab</span>
      </a>
      <details className="record-technical">
        <summary>Technical details</summary>
        <p>Public transaction ID</p>
        <code>{anchor.txHash}</code>
        <p>Recorded at {time(anchor.blockTimestamp)} · block {anchor.blockNumber.toLocaleString()}.</p>
      </details>
    </div>
  );
}
