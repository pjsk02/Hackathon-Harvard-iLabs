import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Only explicit web links are navigable. Images and raw HTML never enter the DOM.
export function replyUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
export function AtlasReply({ text }: { text: string }) {
  return <div className="atlas-reply"><Markdown remarkPlugins={[remarkGfm]} skipHtml
    urlTransform={(url, key) => key === "href" ? replyUrl(url) : undefined}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}<span className="sr-only"> (opens in a new tab)</span></a> : <span>{children}</span>,
      img: ({ alt }) => <span className="reply-image">[Image omitted{alt ? `: ${alt}` : ""}]</span>,
      table: ({ children }) => <div className="reply-scroll" tabIndex={0} role="region" aria-label="Answer table"><table>{children}</table></div>,
      pre: ({ children }) => <div className="reply-scroll" tabIndex={0} role="region" aria-label="Answer code"><pre>{children}</pre></div>,
    }}>{text}</Markdown></div>;
}
