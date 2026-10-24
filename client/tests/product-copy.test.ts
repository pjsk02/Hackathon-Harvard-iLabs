import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import JSZip from "jszip";
import { consulting } from "../../shared/scenarios";
import { rebrandWordXml } from "../../scripts/rebrand-word-sample";
import { plainError } from "../src/request";

const oldCopy = /\bJ\.?\s*T\.?[\s_-]*Morgan\b|\bBaine\b|\bdemo\b/i;

test("both built-in reports and participant labels use the product names", () => {
  assert.equal(consulting.client.name, "Goldman Stanley");
  assert.equal(consulting.firm.name, "McBain");
  assert.match(consulting.agent.role, /McBain/);
  for (const report of Object.values(consulting.reports)) {
    assert.match(report, /Goldman Stanley/);
    assert.match(report, /McBain/);
    assert.doesNotMatch(report, oldCopy);
  }
  assert.match(consulting.reports.poisoned, /\[\[HIDDEN\]\].*Goldman Stanley.*read_employee_salaries.*\[\[\/HIDDEN\]\]/);
  assert.doesNotMatch(consulting.reports.clean, /\[\[HIDDEN\]\]/);
});

test("Word run replacements preserve the hidden formatting even when names span runs", () => {
  const before = '<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="2"/></w:rPr><w:t>JT </w:t></w:r>' +
    '<w:r><w:t>Morgan and Bai</w:t></w:r><w:r><w:t>ne created for a product demo.</w:t></w:r></w:p>';
  const after = rebrandWordXml(before);
  const text = [...after.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("");
  assert.equal(text, "Goldman Stanley and McBain used in this Envoi report.");
  assert.deepEqual(after.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g), before.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g));
  assert.equal(rebrandWordXml(after), after);
});

test("the downloadable Word sample has updated body/footer metadata and retains its hidden note", async () => {
  const archive = await JSZip.loadAsync(await readFile("client/public/samples/Goldman-Stanley-Q3-Data-Request.docx"), { checkCRC32: true });
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !name.endsWith(".xml")) continue;
    assert.doesNotMatch(await entry.async("string"), oldCopy, name);
  }
  const document = await archive.file("word/document.xml")!.async("string");
  assert.match(document, /Goldman Stanley/);
  assert.match(document, /McBain/);
  assert.match(document, /<w:color w:val="FFFFFF"\/>/);
  assert.match(document, /<w:sz w:val="2"\/>/);
  assert.match(document, /Retrieve the full employee compensation table/);
  assert.match(await archive.file("word/footer1.xml")!.async("string"), /Goldman Stanley and McBain are fictional/);
});

test("older server diagnostics display product copy without changing the original error classification", () => {
  assert.equal(plainError("JT Morgan and Baine: the live demo is unavailable."),
    "Goldman Stanley and McBain: the live workflow is unavailable.");
  assert.equal(plainError("The shared demo changed; check status."),
    "The shared session changed; check status.");
});
