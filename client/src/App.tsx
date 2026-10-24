import { lazy, Suspense } from "react";
const SplitApp=lazy(()=>import("./split/SplitApp"));
const Landing=lazy(()=>import("./Landing"));

function App() {
  const query=new URLSearchParams(window.location.search);
  // Old bookmarked view/preflight entry points open the current durable workspace.
  // They never re-enable retired spending/self-test APIs.
  const workspace=window.location.pathname==="/workspace" || query.has("preflight") || query.has("classic") || query.has("view");
  if(workspace)return <Suspense fallback={<p className="loading" role="status">Opening workspace…</p>}><SplitApp /></Suspense>;
  if(window.location.pathname==="/")return <Suspense fallback={<p className="loading" role="status">Opening Envoi…</p>}><Landing /></Suspense>;
  return <main className="loading"><h1>Page not found</h1><a href="/">Return to Envoi</a></main>;
}

export default App;
