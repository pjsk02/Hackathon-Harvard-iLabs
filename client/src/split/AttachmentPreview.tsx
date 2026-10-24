// The report preview (key 1). The hidden note stays in the DOM, invisible,
// until key 1 is pressed again; then it shows in a red box.
import { COPY } from "../labels";

type Props = { report: string; revealed: boolean; onClose: () => void };

export default function AttachmentPreview({ report, revealed, onClose }: Props) {
  const [title, ...rest] = report.split("\n\n");
  return (
    <div className="preview" role="dialog" aria-label={COPY.attachments.poisoned}>
      <div className="preview-bar">
        <span>📎 {COPY.attachments.poisoned}</span>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      <article className="preview-doc">
        <h3>{title}</h3>
        {rest.map((para, i) => {
          const m = para.match(/^\[\[HIDDEN\]\]([\s\S]*)\[\[\/HIDDEN\]\]$/);
          if (!m) return <p key={i}>{para}</p>;
          return revealed ? (
            <div key={i} className="hidden-box">
              <div className="hidden-label">{COPY.previewLabel}</div>
              <p>{m[1]}</p>
            </div>
          ) : (
            <p key={i} className="hidden-text">{m[1]}</p>
          );
        })}
      </article>
    </div>
  );
}
