// Update the downloadable report without recreating its layout or hidden runs.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const names = /\bJ\.?\s*T\.?[\s_-]*Morgan\b|\bBaine\b|created for a product demo|\bdemo\b/gi;
function replacement(text: string): string {
  if (/^J/i.test(text)) return "Goldman Stanley";
  if (/^Baine$/i.test(text)) return "McBain";
  if (/^created /i.test(text)) return "used in this Envoi report";
  return "example";
}

/** Replace text across Word runs while leaving every formatting tag intact. */
export function rebrandWordXml(xml: string): string {
  const paragraphs = xml.replace(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g, (paragraph) => {
    const nodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    const original = nodes.map((node) => node[1]);
    const joined = original.join("");
    const edits = [...joined.matchAll(names)];
    if (!edits.length) return paragraph;
    const offsets: number[] = [];
    let offset = 0;
    for (const text of original) { offsets.push(offset); offset += text.length; }
    const text = [...original];
    for (const edit of edits.reverse()) {
      const start = edit.index!;
      const end = start + edit[0].length;
      for (let i = 0; i < nodes.length; i++) {
        const left = offsets[i];
        const right = left + original[i].length;
        if (end <= left || start >= right) continue;
        const a = Math.max(0, start - left);
        const b = Math.min(original[i].length, end - left);
        text[i] = text[i].slice(0, a) + (start >= left ? replacement(edit[0]) : "") + text[i].slice(b);
      }
    }
    let index = 0;
    return paragraph.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,
      (_match, open: string, _text: string, close: string) => `${open}${text[index++]}${close}`);
  });
  // Metadata and other XML parts may contain plain unsplit names as well.
  return paragraphs.replace(names, replacement);
}

export async function rebrandWordSample(
  filePath = resolve("client/public/samples/Goldman-Stanley-Q3-Data-Request.docx"),
) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true });
  let changed = 0;
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !name.endsWith(".xml")) continue;
    const original = await entry.async("string");
    const updated = rebrandWordXml(original);
    if (updated !== original) {
      archive.file(name, updated, { date: entry.date });
      changed++;
    }
  }
  if (changed) await writeFile(filePath, await archive.generateAsync({
    type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 },
  }));
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Updated ${await rebrandWordSample()} Word XML parts; layout and hidden formatting retained.`);
}
