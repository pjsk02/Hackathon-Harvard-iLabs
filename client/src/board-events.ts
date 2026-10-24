// Only an invalidation signal crosses tabs, never workspace content or identifiers.
export function announceBoardChange() {
  window.dispatchEvent(new Event("envoi-board-change"));
  try { localStorage.setItem("envoi-board-change",crypto.randomUUID()); } catch { /* Focus refresh still works. */ }
}
