import { useSyncExternalStore } from "react";
import { createPresentationStore } from "./presentation-store";

function tabStorage() {
  try { return window.sessionStorage; } catch { return undefined; }
}
export const demoPresentation = createPresentationStore(typeof window === "undefined" ? undefined : tabStorage());
export const useDemoPresentation = () => useSyncExternalStore(
  demoPresentation.subscribe, demoPresentation.getSnapshot, demoPresentation.getSnapshot,
);
