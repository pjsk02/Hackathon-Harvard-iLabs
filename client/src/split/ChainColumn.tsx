// Middle column: Monad, the record of what Atlas may do. Only permissions are
// blocks; a blocked request shows as a dashed time marker, never a block.
import type { Receipt, Slip } from "@shared/contract";
import { consulting } from "@shared/scenarios";
import { CLIENT, COPY, permissionName, shortLabel, time, weekday } from "../labels";

type Props = { slips: Slip[]; blocked: Receipt | null; pulse: Slip["label"] | null };

type Item =
  | { kind: "slip"; at: number; rank: number; slip: Slip }
  | { kind: "marker"; at: number; rank: number; receipt: Receipt };

export default function ChainColumn({ slips, blocked, pulse }: Props) {
  const items: Item[] = [
    ...slips.map((s): Item => ({ kind: "slip", at: s.anchor?.blockTimestamp ?? Infinity, rank: s.label === "Original" ? 0 : 2, slip: s })),
    ...(blocked ? [{ kind: "marker", at: blocked.actionTime, rank: 1, receipt: blocked } as Item] : []),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank);

  return (
    <section className="pane pane-chain">
      <h2 className="pane-head">
        <span className="pane-name">{COPY.headers.chain.name}</span>
        <span className="pane-role">{COPY.headers.chain.role}</span>
      </h2>
      <p className="chain-sub">{COPY.chainSubtitle}</p>

      <div className="chain">
        {items.length === 0 && <p className="empty">{COPY.empty.chain}</p>}
        {items.map((it) =>
          it.kind === "marker" ? (
            <div key={`m-${it.receipt.id}`} className="marker">
              Blocked request ({shortLabel(it.receipt.action).toLowerCase()}) · {time(it.receipt.actionTime)}
            </div>
          ) : (
            <Block
              key={it.slip.mandate.mandateId}
              slip={it.slip}
              pulsing={pulse === it.slip.label}
              late={!!blocked && it.slip.label === "Amended" && !!it.slip.anchor && it.slip.anchor.blockTimestamp > blocked.actionTime}
            />
          ),
        )}
      </div>
    </section>
  );
}

function Block({ slip, pulsing, late }: { slip: Slip; pulsing: boolean; late: boolean }) {
  const allowed = slip.mandate.allowedActions;
  const items = [consulting.allowed, consulting.forbidden];
  return (
    <div className={`block ${pulsing ? "pulsing" : ""} ${late ? "late" : ""}`}>
      <div className="block-top">
        <span className="block-name">{permissionName(slip)}</span>
        {slip.anchor ? (
          <a href={slip.anchor.explorerUrl} target="_blank" rel="noreferrer">
            block {slip.anchor.blockNumber.toLocaleString()} ↗
          </a>
        ) : <span className="dim">not on Monad yet</span>}
      </div>
      <div className="block-label">{COPY.mayRead}</div>
      <ul className="block-items">
        {items.map((a) => {
          const on = allowed.includes(a.name);
          return <li key={a.name} className={on ? "yes" : "no"}>{on ? "✓" : "✕"} {a.label}</li>;
        })}
      </ul>
      <div className="block-meta">
        {slip.label === "Amended" ? `dated ${weekday(slip.mandate.issuedAt)}` : `signed by ${CLIENT}`}
        {slip.anchor && ` · ${time(slip.anchor.blockTimestamp)}`}
      </div>
      {late && <span className="late-tag">{COPY.addedAfter}</span>}
    </div>
  );
}
