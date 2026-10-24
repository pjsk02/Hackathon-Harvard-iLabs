// Left column: Baine, the consulting firm. A chat with Atlas; requests to
// JT Morgan appear as messages and JT Morgan's answers come back as replies.
import { useEffect, useRef } from "react";
import { AGENT, CLIENT, COPY, FIRM, requestText } from "../labels";
import AttachmentPreview from "./AttachmentPreview";
import AttachmentIcon from "./AttachmentIcon";
import type { FeedItem, Preview } from "./types";
import { ACCEPT, type Attachment, type Part } from "./upload";

type Props = {
  feed: FeedItem[];
  preview: Preview;
  attachment: Attachment;
  previewParts: Part[];
  canSend: boolean;
  canUpload: boolean;
  sendReason?: string;
  busy: boolean;
  onSend: () => void;
  onUpload: (file: File) => void;
  onClosePreview: () => void;
  onToggleHidden: () => void;
};

export default function BainePane({ feed, preview, attachment, previewParts, canSend, canUpload, sendReason, busy, onSend, onUpload, onClosePreview, onToggleHidden }: Props) {
  const log = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior });
  }, [feed]);

  return (
    <section className="pane pane-firm">
      <h2 className="pane-head">
        <span className="pane-name">{COPY.headers.firm.name}</span>
        <span className="pane-role">{COPY.headers.firm.role}</span>
      </h2>

      <div className="feed" ref={log} role="log" aria-label="Atlas conversation" aria-live="polite">
        {feed.length === 0 && <p className="empty">{COPY.empty.firm}</p>}
        {feed.map((item) => <FeedRow key={item.id} item={item} />)}
      </div>

      <div className="composer">
        <div className="composer-field">
          <span>{COPY.analyst}</span>
          <span className="clip"><AttachmentIcon /> {attachment.fileName}</span>
        </div>
        <input
          ref={picker}
          type="file"
          accept={ACCEPT}
          hidden
          disabled={!canUpload}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <button className="attach" onClick={() => picker.current?.click()} disabled={!canUpload} title={COPY.upload.title} aria-label={COPY.upload.title}>
          <AttachmentIcon />
        </button>
        <button onClick={onSend} disabled={!canSend} title={!canSend ? sendReason : undefined}>{COPY.send}</button>
      </div>
      <a className="sample-link" href="/samples/JT-Morgan-Q3-Data-Request.docx" download>{COPY.upload.sample}</a>

      {preview !== "closed" && (
        <AttachmentPreview fileName={attachment.fileName} parts={previewParts} revealed={preview === "revealed"} onClose={onClosePreview} onToggleHidden={onToggleHidden} busy={busy} />
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
          <span className="clip"><AttachmentIcon /> {item.attachment}</span>
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
