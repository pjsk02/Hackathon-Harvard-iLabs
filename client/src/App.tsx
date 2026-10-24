// Picks the view: the three-column stage (default) or the classic one-screen
// fallback (/?view=classic). Press V to switch. /?preflight=1 opens the pre-flight panel.
import { useEffect, useState } from "react";
import ClassicApp from "./classic/ClassicApp";
import Preflight from "./Preflight";
import SplitApp from "./split/SplitApp";

type View = "stage" | "classic";

export default function App() {
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get("view") === "classic" ? "classic" : "stage",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[data-demo-busy='true']")) return;
      if (e.key === "v" || e.key === "V") setView((v) => (v === "stage" ? "classic" : "stage"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (new URLSearchParams(window.location.search).get("preflight") === "1") return <Preflight />;
  return view === "classic" ? <ClassicApp /> : <SplitApp />;
}
