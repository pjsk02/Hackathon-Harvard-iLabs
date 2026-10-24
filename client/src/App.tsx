// Picks the view: the three-column stage (default) or the classic one-screen
// fallback (/?view=classic). Press V to switch.
import { useEffect, useState } from "react";
import ClassicApp from "./classic/ClassicApp";
import SplitApp from "./split/SplitApp";

type View = "stage" | "classic";

export default function App() {
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.search).get("view") === "classic" ? "classic" : "stage",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "v" || e.key === "V") setView((v) => (v === "stage" ? "classic" : "stage"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return view === "classic" ? <ClassicApp /> : <SplitApp />;
}
