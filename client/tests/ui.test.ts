import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { idle, openHarness, permission, uploadText } from "./ui-harness";

let browser: Browser;
before(async () => {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH ??
    ["/repl/tools/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
  if (!executablePath) throw new Error("Set CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");
  browser = await puppeteer.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
});
after(async () => { await browser?.close(); });

test("Grant-first flow retains the uploaded hidden Word note through both examples", async () => {
  const h = await openHarness(browser);
  try {
    const labels = await h.page.$$eval(".stage-keys button", (buttons) => buttons.slice(0, 4).map((b) => b.textContent?.trim()));
    assert.deepEqual(labels, ["1 Grant", "2 Clean example", "3 Injected example", "4 Monad evidence"]);
    assert.equal(await h.page.$eval('[data-key="2"]', (b) => (b as HTMLButtonElement).disabled), true);
    const input = await h.page.$('input[type="file"]');
    await input!.uploadFile(resolve("client/public/samples/JT-Morgan-Q3-Data-Request.docx"));
    await h.page.waitForSelector(".preview .hidden-text");
    const hidden = await h.page.$$eval(".hidden-text", (elements) => elements.map((e) => e.textContent!.trim()));
    assert.ok(hidden.length > 0);
    await h.page.click(".preview-tools button");
    assert.equal(await h.page.$$eval(".hidden-box", (elements) => elements.length), hidden.length);
    await h.page.keyboard.press("Escape");
    await h.page.waitForSelector(".preview", { hidden: true });
    await h.page.keyboard.press("1"); await idle(h.page);
    await h.page.keyboard.press("2"); await idle(h.page);
    assert.equal(await h.page.$$eval(".allowed-evidence tbody tr", (rows) => rows.length), 3);
    assert.equal(await h.page.$$eval(".weakest strong", (rows) => rows.length), 2);
    await h.page.keyboard.press("3"); await idle(h.page);
    assert.equal(await h.page.$eval(".stamp", (e) => e.textContent), "BLOCKED");
    const uploaded = h.calls.filter((c) => c.path === "/api/agent/run").at(-1)!.body.upload;
    assert.equal(uploaded.fileName, "JT-Morgan-Q3-Data-Request.docx");
    for (const text of hidden) assert.ok(uploaded.text.includes(text));
    assert.equal(h.state.counter, 3);
    assert.equal(await h.page.$$eval(".allowed-evidence tbody tr", (rows) => rows.length), 3);
    await h.page.keyboard.press("4");
    assert.equal(await h.page.evaluate(() => document.activeElement?.id), "monad-evidence");
    assert.ok((await h.page.$eval("#monad-evidence", (e) => e.textContent))?.includes("Not recorded on Monad"));
    await h.page.keyboard.press("0");
    assert.equal(h.calls.filter((c) => c.path === "/api/reset").length, 0);
    await h.page.keyboard.press("0"); await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path === "/api/reset").length, 1);
    assert.equal(await h.page.$eval(".counter-value", (e) => e.textContent), "0");
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("Grant failure is visible beside the button without invented success", async () => {
  const h = await openHarness(browser);
  try {
    h.grantMode = "failure";
    await h.page.click(".grant .primary"); await idle(h.page);
    assert.equal(await h.page.$eval('[role="alert"]', (e) => e.textContent), "The Monad connection is not built yet.");
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), false);
    assert.equal(h.state.slips.length, 0);
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 1);
    assert.ok((await h.page.$eval(".request-feedback", (e) => e.textContent))?.includes("not yet verified"));
  } finally { await h.context.close(); }
});

test("duplicate clicks stay locked until the one submitted Grant responds", async () => {
  const h = await openHarness(browser);
  try {
    h.grantMode = "hold";
    await h.page.$eval(".grant .primary", (button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await h.page.waitForFunction(() => document.querySelector(".request-feedback")?.textContent?.includes("Waiting for confirmation"));
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 1);
    assert.equal(await h.page.$$eval(".stage-keys button", (buttons) => buttons.every((b) => (b as HTMLButtonElement).disabled)), true);
    assert.equal(await h.page.$eval('[data-testid="check-status"]', (b) => (b as HTMLButtonElement).disabled), true);
    h.state.slips = [structuredClone(permission)];
    await h.held!.respond({ status: 200, contentType: "application/json", body: JSON.stringify(permission) });
    await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 1);
  } finally { await h.context.close(); }
});

test("lost Grant reply persists across reload and Check status never resubmits it", async () => {
  const h = await openHarness(browser);
  try {
    h.grantMode = "network";
    await h.page.click(".grant .primary"); await idle(h.page);
    assert.ok((await h.page.$eval(".request-feedback", (e) => e.textContent))?.includes("Outcome not confirmed"));
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), true);
    await h.page.reload({ waitUntil: "networkidle0" });
    await idle(h.page);
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 1);
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), true);
    h.state.slips = [structuredClone(permission)];
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.equal(await h.page.$eval('[data-key="2"]', (b) => (b as HTMLButtonElement).disabled), false);
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 1);
  } finally { await h.context.close(); }
});

test("malformed replies and failed health checks can recover without reloading", async () => {
  const h = await openHarness(browser);
  try {
    h.badState = true;
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.match(await h.page.$eval('[role="alert"]', (e) => e.textContent ?? ""), /unreadable/);
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), true);
    h.badState = false; h.badHealth = true;
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), true);
    h.badHealth = false;
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.equal(await h.page.$eval(".grant .primary", (b) => (b as HTMLButtonElement).disabled), false);
    h.grantMode = "invalid";
    await h.page.click(".grant .primary"); await idle(h.page);
    assert.match(await h.page.$eval('[role="alert"]', (e) => e.textContent ?? ""), /incomplete/);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("unsupported, empty, oversize and corrupt uploads fail plainly without replacing the valid attachment", async () => {
  const h = await openHarness(browser);
  try {
    await uploadText(h.page, "kept.txt", "A readable report.");
    await h.page.keyboard.press("Escape");
    for (const [name, text, expected] of [
      ["bad.pdf", "file", /Word.*\.txt/],
      ["empty.txt", " \n ", /no readable text/],
      ["huge.txt", "x".repeat(5_000_001), /5 MB/],
      ["long.txt", "x".repeat(60_001), /60,000/],
      ["broken.docx", "not a zip", /valid \.docx/],
    ] as const) {
      await uploadText(h.page, name, text);
      assert.match(await h.page.$eval('[role="alert"]', (e) => e.textContent ?? ""), expected);
      assert.match(await h.page.$eval(".composer .clip", (e) => e.textContent ?? ""), /kept\.txt/);
    }
    assert.equal(h.calls.filter((c) => ["/api/slips", "/api/agent/run"].includes(c.path)).length, 0);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("projector/mobile layouts, keyboard focus and reduced motion remain usable", async () => {
  const h = await openHarness(browser);
  try {
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    await h.page.keyboard.press("Tab");
    assert.notEqual(await h.page.evaluate(() => document.activeElement?.tagName), "BODY");
    await h.page.evaluate(() => { const input = document.createElement("input"); input.id = "test-input"; document.body.append(input); input.focus(); });
    await h.page.keyboard.press("1");
    assert.equal(h.calls.filter((c) => c.path === "/api/slips").length, 0);
    await h.page.evaluate(() => document.getElementById("test-input")!.remove());
    await h.page.click(".grant .primary"); await idle(h.page);
    await h.page.keyboard.press("2"); await idle(h.page);
    const stamp = await h.page.$eval(".stamp", (e) => ({ size: parseFloat(getComputedStyle(e).fontSize), animation: getComputedStyle(e).animationDuration }));
    assert.ok(stamp.size >= 40);
    assert.equal(stamp.animation, "0s");
    await h.page.setViewport({ width: 390, height: 844 });
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("classic and pre-flight use the same recovery guard; no automatic self-test", async () => {
  const h = await openHarness(browser, "/?view=classic");
  try {
    h.grantMode = "network";
    await h.page.keyboard.press("1"); await idle(h.page);
    assert.ok((await h.page.$eval(".request-feedback", (e) => e.textContent))?.includes("Outcome not confirmed"));
    const base = new URL(h.page.url());
    base.search = "?preflight=1";
    await h.page.goto(base.href, { waitUntil: "networkidle0" });
    assert.equal(h.calls.filter((c) => c.path === "/api/selftest").length, 0);
    assert.equal(await h.page.$eval('[aria-describedby="selftest-warning"]', (b) => (b as HTMLButtonElement).disabled), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});
