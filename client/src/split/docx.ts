// Reads a Word (.docx) report in the browser. Every piece of text is kept for
// the AI; runs a reader can't see are marked hidden: Word's "Hidden" font
// effect, white text on a plain background, or text at 2pt or smaller.
import JSZip from "jszip";
import type { Part } from "./upload";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TEXT_PARTS = [/^word\/document\.xml$/, /^word\/header\d*\.xml$/, /^word\/footer\d*\.xml$/, /^word\/footnotes\.xml$/, /^word\/endnotes\.xml$/, /^word\/comments\.xml$/];

type Group = { text: string; hidden: boolean };

export async function partsFromDocx(file: File): Promise<Part[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => TEXT_PARTS.some((re) => re.test(n))).sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));
  if (!names.includes("word/document.xml")) throw new Error("That Word file has no document text.");
  const parts: Part[] = [];
  for (const name of names) {
    const xml = await zip.file(name)!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    walk(doc.documentElement, parts);
  }
  return parts;
}

function walk(el: Element, out: Part[]) {
  for (const child of Array.from(el.children)) {
    if (child.namespaceURI !== W) {
      walk(child, out);
      continue;
    }
    if (child.localName === "p") pushGroups(groupsOf(child), out);
    else if (child.localName === "tbl") table(child, out);
    else walk(child, out);
  }
}

/** One part per table row; hidden cell text becomes its own part so it can be revealed. */
function table(tbl: Element, out: Part[]) {
  for (const tr of Array.from(tbl.children).filter((c) => c.localName === "tr")) {
    const visible: string[] = [];
    const hidden: Group[] = [];
    for (const tc of Array.from(tr.children).filter((c) => c.localName === "tc")) {
      const cellParts: Part[] = [];
      walk(tc, cellParts);
      const vis = cellParts.filter((p) => !p.hidden).map((p) => p.text).join(" ");
      if (vis) visible.push(vis);
      hidden.push(...cellParts.filter((p) => p.hidden));
    }
    if (visible.length) out.push({ text: visible.join(" · "), hidden: false });
    out.push(...hidden);
  }
}

function pushGroups(groups: Group[], out: Part[]) {
  for (const g of groups) {
    const text = g.text.replace(/\s+/g, " ").trim();
    if (text) out.push({ text, hidden: g.hidden });
  }
}

/** Consecutive runs with the same visibility, in document order. */
function groupsOf(p: Element): Group[] {
  const groups: Group[] = [];
  for (const r of Array.from(p.getElementsByTagNameNS(W, "r"))) {
    const text = runText(r);
    if (!text) continue;
    const hidden = runHidden(r);
    const last = groups[groups.length - 1];
    if (last && last.hidden === hidden) last.text += text;
    else groups.push({ text, hidden });
  }
  return groups;
}

function runText(r: Element): string {
  let s = "";
  for (const c of Array.from(r.children)) {
    if (c.namespaceURI !== W) continue;
    if (c.localName === "t") s += c.textContent ?? "";
    else if (c.localName === "tab" || c.localName === "br" || c.localName === "cr") s += " ";
  }
  return s;
}

function runHidden(r: Element): boolean {
  const rPr = Array.from(r.children).find((c) => c.localName === "rPr");
  if (!rPr) return false;
  const prop = (name: string) => Array.from(rPr.children).find((c) => c.localName === name) ?? null;
  const on = (el: Element | null) => !!el && !/^(0|false|off)$/i.test(el.getAttributeNS(W, "val") ?? "");
  if (on(prop("vanish")) || on(prop("webHidden"))) return true;
  const size = Number(prop("sz")?.getAttributeNS(W, "val") ?? NaN); // half-points
  if (size > 0 && size <= 4) return true;
  const color = (prop("color")?.getAttributeNS(W, "val") ?? "").toUpperCase();
  if (/^F[0-9A-F]F[0-9A-F]F[0-9A-F]$/.test(color) && !shaded(r, rPr)) return true;
  return false;
}

/** White text is visible when something dark sits behind it: a highlight, or run / paragraph / cell shading. */
function shaded(r: Element, rPr: Element): boolean {
  const dark = (el: Element | null | undefined) => {
    const fill = (el?.getAttributeNS(W, "fill") ?? "auto").toUpperCase();
    return fill !== "AUTO" && !/^F[0-9A-F]F[0-9A-F]F[0-9A-F]$/.test(fill);
  };
  if (Array.from(rPr.children).some((c) => c.localName === "highlight")) return true;
  if (dark(Array.from(rPr.children).find((c) => c.localName === "shd"))) return true;
  for (let e: Element | null = r.parentElement; e; e = e.parentElement) {
    if (e.localName === "p") {
      const pPr = Array.from(e.children).find((c) => c.localName === "pPr");
      if (dark(pPr && Array.from(pPr.children).find((c) => c.localName === "shd"))) return true;
    }
    if (e.localName === "tc") {
      const tcPr = Array.from(e.children).find((c) => c.localName === "tcPr");
      if (dark(tcPr && Array.from(tcPr.children).find((c) => c.localName === "shd"))) return true;
    }
  }
  return false;
}
