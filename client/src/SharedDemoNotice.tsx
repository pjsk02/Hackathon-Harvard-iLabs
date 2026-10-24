import { useDemoPresentation } from "./demo-presentation";
import { AGENT, CLIENT, FIRM } from "./labels";

export default function SharedDemoNotice() {
  const { serverBusy, storageWarning } = useDemoPresentation();
  return <aside className="demo-guide" aria-label="Product guide">
    <p><strong>Product guide.</strong> {CLIENT} controls what {FIRM}&apos;s agent, {AGENT}, can read. Each request is checked against the signed permission.</p>
    <p>Click Grant → Clean example → upload a report → Injected example → Monad evidence.</p>
    <p><strong>Shared session · one action at a time.</strong> {serverBusy
      ? "Another action is being processed. Use Check status before continuing; Reset is unavailable during work."
      : "To start over, click New run / Reset twice. This clears the shared screen and your saved upload, not public records. Server restarts also clear the shared run."}</p>
    {storageWarning && <p role="status">{storageWarning}</p>}
  </aside>;
}
