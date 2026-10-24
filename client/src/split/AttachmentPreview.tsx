// The report preview (key 1). Hidden paragraphs stay in the DOM, invisible,
// until key 1 is pressed again; then they show in a red box.
import { COPY } from "../labels";
import type { Part } from "./upload";

type Props = { fileName: string; parts: Part[]; revealed: boolean; onClose: () => void };

export default function AttachmentPreview({ fileName, parts, revealed, onClose }: Props) {
  const [title, ...rest] = parts;
  const hiddenCount = parts.filter((p) => p.hidden).length;
  return (
    <div className="preview" role="dialog" aria-label={fileName}>
      <div className="preview-bar">
        <span>📎 {fileName}</span>
        {revealed && <span className="preview-count">{hiddenCount === 0 ? "No hidden text found" : `${hiddenCount} hidden`}</span>}
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      <article className="preview-doc">
        {title && <h3 className={title.hidden ? "hidden-text" : ""}>{title.text}</h3>}
        {rest.map((p, i) =>
          !p.hidden ? <p key={i}>{p.text}</p>
          : revealed ? (
            <div key={i} className="hidden-box">
              <div className="hidden-label">{COPY.previewLabel}</div>
              <p>{p.text}</p>
            </div>
          ) : <p key={i} className="hidden-text">{p.text}</p>,
        )}
      </article>
    </div>
  );
}
