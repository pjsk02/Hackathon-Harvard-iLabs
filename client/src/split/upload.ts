// Turns a report (built-in or uploaded) into paragraphs, marking the ones a
// person can't see. The AI gets ALL the text; people only see the visible parts.
import type { ReportId } from "@shared/contract";
import { partsFromDocx } from "./docx";

export type Part = { text: string; hidden: boolean };

export type Attachment =
  | { kind: "builtin"; reportId: ReportId; fileName: string }
  | { kind: "upload"; fileName: string; text: string; parts: Part[] };

export const ACCEPT = ".docx,.txt,.md,.html,.htm";
const MAX_CHARS = 60_000;

/** Built-in scenario text uses [[HIDDEN]]…[[/HIDDEN]] markers. */
export function partsFromScenario(report: string): Part[] {
  return report.split("\n\n").map((p) => {
    const m = p.match(/^\[\[HIDDEN\]\]([\s\S]*)\[\[\/HIDDEN\]\]$/);
    return m ? { text: m[1], hidden: true } : { text: p, hidden: false };
  });
}

// Inline styles people use to hide text from readers but not from an AI.
const HIDING = /(color\s*:\s*(#fff\b|#ffffff\b|white\b|transparent\b|rgba?\([^)]*,\s*0\s*\)))|font-size\s*:\s*0(px|pt|em)?\s*(;|$)|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(\.0+)?\s*(;|$)/i;

function isHidden(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (HIDING.test(e.getAttribute("style") ?? "") || e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true") return true;
  }
  return false;
}

function partsFromHtml(html: string): Part[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((n) => n.remove());
  const blocks = doc.body.querySelectorAll("h1,h2,h3,h4,p,li,td,div,span");
  const parts: Part[] = [];
  const seen = new Set<Element>();
  blocks.forEach((b) => {
    // Use leaf-ish blocks only: skip a block if it contains another block.
    if (b.querySelector("h1,h2,h3,h4,p,li,td,div") || [...seen].some((s) => s.contains(b))) return;
    if (b.tagName === "SPAN" && b.parentElement && b.parentElement !== doc.body && !isHidden(b)) return;
    const text = (b.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    seen.add(b);
    parts.push({ text, hidden: isHidden(b) });
  });
  if (parts.length === 0) {
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) parts.push({ text, hidden: false });
  }
  return parts;
}

function partsFromText(text: string): Part[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => ({ text: p, hidden: false }));
}

export async function readUpload(file: File): Promise<Attachment> {
  if (!/\.(docx|txt|md|html?)$/i.test(file.name)) throw new Error("Upload a Word (.docx), .txt, .md or .html file.");
  if (file.size > 5_000_000) throw new Error("That file is too large.");
  let parts: Part[];
  if (/\.docx$/i.test(file.name)) {
    parts = await partsFromDocx(file);
  } else {
    const raw = await file.text();
    parts = /\.html?$/i.test(file.name) ? partsFromHtml(raw) : partsFromText(raw);
  }
  const text = parts.map((p) => p.text).join("\n\n");
  if (!text) throw new Error("That file has no readable text.");
  if (text.length > MAX_CHARS) throw new Error("That file is too long.");
  return { kind: "upload", fileName: file.name, text, parts };
}
