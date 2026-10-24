// Left column: Baine, the consulting firm. A chat with Atlas; requests to
// JT Morgan appear as messages and JT Morgan's answers come back as replies.
import { useEffect, useRef } from "react";
import { AGENT, CLIENT, COPY, FIRM, requestText } from "../labels";
import AttachmentPreview from "./AttachmentPreview";
import type { FeedItem, Preview, ReportId } from "./types";

type Props = {
  feed: FeedItem[];
  preview: Preview;
  attached: ReportId;
  report: string;
  canSend: boolean;
  onSend: () => void;
  onClosePreview: () => void;
};

export default function BainePane({ feed, preview, attached, report, canSend, onSend, onClosePreview }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [feed]);

  return (
    <section className="pane pane-firm">
      <h2 className="pane-head">
        <span className="pane-name">{COPY.headers.firm.name}</span>
        <span className="pane-role">{COPY.headers.firm.role}</span>
      </h2>

      <div className="feed">
        {feed.length === 0 && <p className="empty">{COPY.empty.firm}</p>}
        {feed.map((item) => <FeedRow key={item.id} item={item} />)}
        <div ref={end} />
      </div>

      <div className="composer">
        <div className="composer-field">
          <span>{COPY.analyst}</span>
          <span className="clip">📎 {COPY.attachments[attached]}</span>
        </div>
        <button onClick={onSend} disabled={!canSend}>{COPY.send}</button>
      </div>

      {preview !== "closed" && (
        <AttachmentPreview report={report} revealed={preview === "revealed"} onClose={onClosePreview} />
      )}
    </section>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "analyst":
    case "firm":
      return (
        <div className="msg msg-user">
          <div className="who">{item.kind === "analyst" ? "Analyst" : FIRM}</div>
          <p>{item.text}</p>
          <span className="clip">📎 {item.attachment}</span>
        </div>
      );
    case "status":
      return (
        <div className="status">
          <span className="who">{AGENT}</span>
          {!item.done && <span className="spinner" aria-hidden />}
          <span>{item.text}</span>
        </div>
      );
    case "request": {
      const tone = item.verdict === null ? "" : item.verdict === "ALLOWED" ? "good" : "bad";
      return (
        <div className={`bubble bubble-out ${tone}`}>
          <div className="bubble-route">
            {AGENT.toUpperCase()} → {CLIENT.toUpperCase()}
            {item.forced && <span className="tag">{COPY.forced}</span>}
          </div>
          <p className="bubble-quote">{requestText(item.action)}</p>
          {item.why && <p className="bubble-why">{COPY.why}</p>}
        </div>
      );
    }
    case "reply":
      return (
        <div className={`bubble bubble-in ${item.tone}`}>
          <div className="bubble-route">{CLIENT.toUpperCase()} → {(item.to === "firm" ? FIRM : AGENT).toUpperCase()}</div>
          <p>{item.text}</p>
        </div>
      );
    case "answer":
      return (
        <div className="msg msg-agent">
          <div className="who">{AGENT}</div>
          <p>{item.text}</p>
        </div>
      );
  }
}
