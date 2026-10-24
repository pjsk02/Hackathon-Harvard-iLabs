import { useDemoPresentation } from "./demo-presentation";

export default function SharedDemoNotice() {
  const { serverBusy, storageWarning } = useDemoPresentation();
  return <aside className="demo-guide" aria-label="How to use this shared demo">
    <p><strong>Shared demo · one run at a time.</strong> Click Grant → Clean example → upload the sample → Injected example → Monad evidence.</p>
    <p>{serverBusy
      ? "Another action is being processed. Use Check status before continuing; Reset is unavailable during work."
      : "To start over, click New run / Reset twice. This clears the shared screen and your saved upload, not public records. Server restarts also clear the shared run."}</p>
    {storageWarning && <p role="status">{storageWarning}</p>}
  </aside>;
}
