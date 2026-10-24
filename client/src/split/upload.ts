// Turns a report (built-in or uploaded) into paragraphs, marking the ones a
// person can't see. The AI gets ALL the text; people only see the visible parts.
import type { ReportId } from "@shared/contract";
import { partsFromDocx } from "./docx";

export type Part = { text: string; hidden: boolean };

export type Attachment =
  | { kind: "builtin"; reportId: ReportId; fileName: string }
  | { kind: "upload"; fileName: string; text: string; parts: Part[] };

export const ACCEPT = ".docx,.txt,.md,.html,.htm";
export const MAX_CHARS = 60_000;
export const MAX_FILE_BYTES = 5_000_000;
export const MAX_FILE_NAME_CHARS = 255;

/** Built-in scenario text uses [[HIDDEN]]…[[/HIDDEN]] markers. */
export function partsFromScenario(report: string): Part[] {
  return partsFromText(report);
}

// Inline styles people use to hide text from readers but not from an AI.
const HIDING = /(color\s*:\s*(#fff\b|#ffffff\b|white\b|transparent\b|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,|\))|rgba?\([^)]*,\s*0\s*\)))|font-size\s*:\s*0(px|pt|em)?\s*(;|$)|display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|opacity\s*:\s*0(\.0+)?\s*(;|$)/i;

function isHidden(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (HIDING.test(e.getAttribute("style") ?? "") || e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true") return true;
    const size = (e.getAttribute("style") ?? "").match(/font-size\s*:\s*([\d.]+)\s*(pt|px)\b/i);
    if (size && Number(size[1]) <= (size[2].toLowerCase() === "pt" ? 2 : 2.67)) return true;
  }
  return false;
}

export function partsFromHtml(html: string): Part[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());
  const parts: Part[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let previousBlock: Element | null = null;
  // Read each text node exactly once. A paragraph's textContent would flatten
  // a hidden nested span into visible text and also duplicate nested blocks.
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = (node.textContent ?? "").replace(/\s+/g, " ");
    if (!text) continue;
    const parent = node.parentElement;
    const block = parent?.closest("h1,h2,h3,h4,h5,h6,p,li,td,th,div,section,article,pre,blockquote") ?? doc.body;
    const hidden = isHidden(parent);
    const previous = parts.at(-1);
    if (previous && previous.hidden === hidden && block === previousBlock) previous.text += text;
    else parts.push({ text, hidden });
    previousBlock = block;
  }
  return parts.map((part) => ({ ...part, text: part.text.trim() })).filter((part) => part.text);
}

export function partsFromText(text: string): Part[] {
  const parts: Part[] = [];
  const marker = /\[\[HIDDEN\]\]|\[\[\/HIDDEN\]\]/g;
  let hidden = false;
  let start = 0;
  const add = (value: string) => {
    for (const paragraph of value.split(/\n\s*\n/)) {
      if (paragraph.trim()) parts.push({ text: paragraph.trim(), hidden });
    }
  };
  for (const match of text.matchAll(marker)) {
    add(text.slice(start, match.index));
    hidden = match[0] === "[[HIDDEN]]";
    start = match.index! + match[0].length;
  }
  add(text.slice(start));
  return parts;
}

export async function readUpload(file: File): Promise<Attachment> {
  if (!/\.(docx|txt|md|html?)$/i.test(file.name)) throw new Error("Upload a Word (.docx), .txt, .md or .html file.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose a file no larger than 5 MB.");
  if (file.name.length > MAX_FILE_NAME_CHARS) throw new Error("Choose a file name with no more than 255 characters.");
  let parts: Part[];
  if (/\.docx$/i.test(file.name)) {
    try {
      parts = await partsFromDocx(file);
    } catch {
      throw new Error("That Word file could not be read; upload a valid .docx file.");
    }
  } else {
    const raw = await file.text();
    parts = /\.html?$/i.test(file.name) ? partsFromHtml(raw) : partsFromText(raw);
  }
  const text = parts.map((p) => p.text).join("\n\n");
  if (!text) throw new Error("That file has no readable text.");
  if (text.length > MAX_CHARS) throw new Error("Choose a report with no more than 60,000 characters.");
  return { kind: "upload", fileName: file.name, text, parts };
}
