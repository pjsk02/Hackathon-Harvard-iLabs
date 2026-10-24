// The report preview (R). Hidden text stays in the DOM and in the upload body.
import { useEffect, useRef } from "react";
import { COPY } from "../labels";
import type { Part } from "./upload";
import AttachmentIcon from "./AttachmentIcon";

type Props = { fileName: string; parts: Part[]; revealed: boolean; onClose: () => void; onToggleHidden: () => void; busy: boolean };

export default function AttachmentPreview({ fileName, parts, revealed, onClose, onToggleHidden, busy }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const hiddenCount = parts.filter((p) => p.hidden).length;
  return (
    <div className="preview" role="dialog" aria-label={`Report preview: ${fileName}`} onKeyDown={(e) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); e.stopPropagation(); onClose(); }
    }}>
      <div className="preview-bar">
        <span><AttachmentIcon /> {fileName}</span>
        <button ref={close} onClick={onClose} disabled={busy} aria-label="Close report">✕</button>
      </div>
      <div className="preview-tools">
        <button onClick={onToggleHidden} disabled={busy} aria-pressed={revealed}>{revealed ? "Hide hidden text" : "Show hidden text"} <kbd>R</kbd></button>
        {revealed && <span role="status" className="preview-count">{hiddenCount === 0 ? "No hidden text found" : `${hiddenCount} hidden`}</span>}
      </div>
      <article className="preview-doc">
        {parts.map((p, i) =>
          !p.hidden ? (i === 0 ? <h3 key={i}>{p.text}</h3> : <p key={i}>{p.text}</p>)
          : revealed ? (
            <div key={i} className="hidden-box">
              <div className="hidden-label">{COPY.previewLabel}</div>
              <p>{p.text}</p>
            </div>
          ) : <p key={i} className="hidden-text" aria-hidden="true">{p.text}</p>,
        )}
      </article>
    </div>
  );
}
