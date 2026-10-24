import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { idle, openHarness, permission, uploadText } from "./ui-harness";
import { sharedApiHarness } from "./shared-api-harness";

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

test("mixed/nested hidden HTML is concealed once, retained in order, and sent with the upload", async () => {
  const h = await openHarness(browser);
  try {
    await uploadText(h.page, "mixed.html", `Direct visible text
      <p>Before <span style="color:white">INLINE_SECRET <b>NESTED_SECRET</b></span> after.</p>
      <div hidden>HIDDEN_PARENT <em>CHILD_SECRET</em></div>
      <div>Outer visible <p>Inner visible</p> trailing visible</div>
      <span style="font-size:1pt">TINY_SECRET</span><span style="display:none">DISPLAY_SECRET</span>
      <script>window.uploadExecuted = true;</script>`);
    const hidden = await h.page.$$eval(".preview-doc .hidden-text", (nodes) => nodes.map((node) => ({
      text: node.textContent, color: getComputedStyle(node).color, aria: node.getAttribute("aria-hidden"),
    })));
    // Consecutive hidden spans may share a part; visibility and exact retained
    // text matter, not the number of preview paragraphs.
    assert.ok(hidden.length > 0);
    for (const secret of ["INLINE_SECRET", "NESTED_SECRET", "HIDDEN_PARENT", "CHILD_SECRET", "TINY_SECRET", "DISPLAY_SECRET"]) {
      assert.ok(hidden.some((part) => part.text?.includes(secret)), `${secret} must be concealed`);
    }
    assert.ok(hidden.every((part) => part.color === "rgba(0, 0, 0, 0)" && part.aria === "true"));
    const visible = await h.page.$$eval(".preview-doc > :not(.hidden-text)", (nodes) => nodes.map((node) => node.textContent).join(" "));
    assert.doesNotMatch(visible, /SECRET/);
    for (const text of ["Direct visible", "Before", "after.", "Outer visible", "Inner visible", "trailing visible"]) assert.ok(visible.includes(text));
    assert.equal(await h.page.evaluate(() => "uploadExecuted" in window), false);
    await h.page.click(".preview-tools button");
    assert.match(await h.page.$eval(".preview-doc", (node) => node.textContent ?? ""), /INLINE_SECRET/);
    await h.page.keyboard.press("Escape");
    await h.page.click('[data-key="1"]'); await idle(h.page);
    await h.page.click('[data-key="2"]'); await idle(h.page);
    await h.page.click('[data-key="3"]'); await idle(h.page);
    const uploaded = h.calls.filter((call) => call.path === "/api/agent/run").at(-1)!.body.upload.text;
    for (const secret of ["INLINE_SECRET", "NESTED_SECRET", "HIDDEN_PARENT", "CHILD_SECRET", "TINY_SECRET", "DISPLAY_SECRET"]) {
      assert.equal(uploaded.split(secret).length - 1, 1, `${secret} must be included exactly once`);
    }
    assert.ok(uploaded.indexOf("Before") < uploaded.indexOf("INLINE_SECRET") && uploaded.indexOf("INLINE_SECRET") < uploaded.indexOf("after."));
    assert.doesNotMatch(uploaded, /uploadExecuted/);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("classic and text previews conceal hidden notes until reveal, including the first paragraph", async () => {
  const h = await openHarness(browser, "/?view=classic");
  try {
    await h.page.click(".segmented button:nth-child(2)");
    assert.ok((await h.page.$$(".doc .hidden-note")).length);
    assert.equal(await h.page.$$eval(".doc .hidden-note", (nodes) => nodes.every((node) =>
      getComputedStyle(node).color === "rgba(0, 0, 0, 0)" && node.getAttribute("aria-hidden") === "true")), true);
    await h.page.click('[data-key="r"]');
    await h.page.waitForSelector(".hidden-note.revealed");
    await uploadText(h.page, "marked.txt", "[[HIDDEN]]FIRST_SECRET[[/HIDDEN]]\n\nVisible text\n\n[[HIDDEN]]LAST_SECRET[[/HIDDEN]]");
    assert.equal(await h.page.$$eval(".doc .hidden-note", (nodes) => nodes.length), 2);
    assert.equal(await h.page.$eval(".doc .hidden-note", (node) => getComputedStyle(node).color), "rgba(0, 0, 0, 0)");
    await h.page.keyboard.press("v"); await idle(h.page);
    await h.page.click('[data-key="r"]');
    await h.page.waitForSelector(".hidden-text");
    assert.doesNotMatch(await h.page.$$eval(".preview-doc > :not(.hidden-text)", (nodes) => nodes.map((node) => node.textContent).join(" ")), /SECRET/);
    await h.page.click(".preview-tools button");
    assert.equal(await h.page.$$eval(".hidden-box", (nodes) => nodes.length), 2);
  } finally { await h.context.close(); }
});

test("upload, completed steps and allowed results survive V and reload; reset clears them without replay", async () => {
  const h = await openHarness(browser);
  try {
    await uploadText(h.page, "retained.html", '<p>Visible report <span hidden>RETAINED_SECRET</span></p>');
    await h.page.keyboard.press("Escape");
    await h.page.click('[data-key="1"]'); await idle(h.page);
    await h.page.click('[data-key="2"]'); await idle(h.page);
    await h.page.keyboard.press("v"); await idle(h.page);
    assert.equal(await h.page.$eval('[data-key="3"]', (button) => (button as HTMLButtonElement).disabled), false);
    await h.page.click('[data-key="3"]'); await idle(h.page);
    assert.equal(h.calls.filter((call) => call.path === "/api/agent/run").at(-1)!.body.upload.fileName, "retained.html");
    await h.page.keyboard.press("v"); await idle(h.page);
    const writes = () => h.calls.filter((call) => ["/api/slips", "/api/agent/run", "/api/act", "/api/reset"].includes(call.path)).length;
    const before = writes();
    await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
    assert.equal(writes(), before);
    assert.equal(await h.page.$eval('[data-key="3"]', (button) => (button as HTMLButtonElement).disabled), false);
    assert.match(await h.page.$eval(".composer .clip", (node) => node.textContent ?? ""), /retained\.html/);
    assert.equal(await h.page.$$eval(".stage-steps li.done", (nodes) => nodes.length), 2);
    assert.equal(await h.page.$eval(".stamp", (node) => node.textContent), "BLOCKED");
    assert.equal(await h.page.$$eval(".allowed-evidence tbody tr", (rows) => rows.length), 3);
    await h.page.click('[data-key="0"]'); await h.page.click('[data-key="0"]'); await idle(h.page);
    await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
    assert.equal(writes(), before + 1);
    assert.equal(await h.page.$eval('[data-key="3"]', (button) => (button as HTMLButtonElement).disabled), true);
    assert.doesNotMatch(await h.page.$eval(".composer .clip", (node) => node.textContent ?? ""), /retained/);
    assert.equal(await h.page.$$eval(".allowed-evidence", (nodes) => nodes.length), 0);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("a confirmed pre-tool AI outage leaves the explicitly forced request usable", async () => {
  const h = await openHarness(browser);
  try {
    await h.page.click('[data-key="1"]'); await idle(h.page);
    h.runMode = "pretool";
    await h.page.click('[data-key="2"]'); await idle(h.page);
    assert.match(await h.page.$eval('[role="alert"]', (node) => node.textContent ?? ""), /AI service did not answer/);
    assert.equal(await h.page.$eval('[data-key="5"]', (button) => (button as HTMLButtonElement).disabled), false);
    await h.page.click('[data-key="5"]'); await idle(h.page);
    assert.equal(h.calls.filter((call) => call.path === "/api/act").length, 1);
    assert.equal(await h.page.$eval(".stamp", (node) => node.textContent), "BLOCKED");
    assert.match(await h.page.$eval(".current .eyebrow", (node) => node.textContent ?? ""), /FORCED REQUEST/);
    assert.doesNotMatch(await h.page.$eval(".bubble-out .bubble-route", (node) => node.textContent ?? ""), /ATLAS/);
    await h.page.keyboard.press("v"); await idle(h.page);
    assert.match(await h.page.$eval(".decision strong", (node) => node.textContent ?? ""), /Forced request/);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("uncertain and malformed model outcomes keep Force guarded across view/reload and read-only recovery", async () => {
  for (const mode of ["uncertain", "network", "malformed"] as const) {
    const h = await openHarness(browser);
    try {
      await h.page.click('[data-key="1"]'); await idle(h.page);
      h.runMode = mode;
      await h.page.click('[data-key="2"]'); await idle(h.page);
      assert.equal(await h.page.$eval('[data-key="5"]', (button) => (button as HTMLButtonElement).disabled), true);
      await h.page.keyboard.press("v"); await idle(h.page);
      assert.equal(await h.page.$eval('[data-key="5"]', (button) => (button as HTMLButtonElement).disabled), true);
      await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
      await h.page.click('[data-testid="check-status"]'); await idle(h.page);
      assert.equal(await h.page.$eval('[data-key="5"]', (button) => (button as HTMLButtonElement).disabled), true);
      assert.equal(h.calls.filter((call) => call.path === "/api/agent/run").length, 1);
      assert.equal(h.calls.filter((call) => call.path === "/api/act").length, 0);
    } finally { await h.context.close(); }
  }
});

test("multibyte reports and honest model refusal are supported without fabricating a blocked attempt", async () => {
  const h = await openHarness(browser);
  try {
    const text = "字".repeat(60_000);
    await uploadText(h.page, "multibyte.txt", text);
    await h.page.keyboard.press("Escape");
    await h.page.click('[data-key="1"]'); await idle(h.page);
    await h.page.click('[data-key="2"]'); await idle(h.page);
    h.runMode = "refusal";
    await h.page.click('[data-key="3"]'); await idle(h.page);
    assert.equal(h.calls.filter((call) => call.path === "/api/agent/run").at(-1)!.body.upload.text, text);
    assert.equal(h.state.receipts.filter((receipt) => receipt.decision === "BLOCKED").length, 0);
    assert.match(await h.page.$eval(".feed", (node) => node.textContent ?? ""), /No data requested/);
    assert.equal(await h.page.$eval('[data-key="5"]', (button) => (button as HTMLButtonElement).disabled), false);
  } finally { await h.context.close(); }
});

test("permission links never become attempt evidence and unverified dispute stays unavailable", async () => {
  const h = await openHarness(browser);
  try {
    await h.page.click('[data-key="1"]'); await idle(h.page);
    await h.page.click('[data-key="2"]'); await idle(h.page);
    await h.page.click('[data-key="3"]'); await idle(h.page);
    await h.page.click('[data-key="4"]');
    assert.doesNotMatch(await h.page.$eval(".evidence-summary", (node) => node.textContent ?? ""), /awaiting|pending/i);
    assert.equal(await h.page.$$eval(".attempt-marker a", (links) => links.length), 0);
    assert.equal(await h.page.$eval(".block a", (link) => (link as HTMLAnchorElement).href), permission.anchor!.explorerUrl);
    assert.ok((await h.page.$eval(".attempt-marker", (node) => node.textContent))?.includes("Not recorded on Monad"));
    assert.equal(await h.page.$eval('[data-key="6"]', (button) => (button as HTMLButtonElement).disabled), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
});

test("two independent browsers receive a real server refusal for overlapping actions and Reset", async () => {
  const api = await sharedApiHarness();
  const first = await openHarness(browser, "/", api.base);
  const second = await openHarness(browser, "/", api.base);
  try {
    await first.page.click('[data-key="1"]');
    await api.grantStarted;
    await second.page.click('[data-key="0"]'); await second.page.click('[data-key="0"]'); await idle(second.page);
    assert.match(await second.page.$eval('[role="alert"]', (node) => node.textContent ?? ""), /Another demo action is still being processed/);
    assert.match(await second.page.$eval(".demo-guide", (node) => node.textContent ?? ""), /Another action is being processed/);
    assert.equal(await second.page.$eval('[data-key="0"]', (button) => (button as HTMLButtonElement).disabled), true);
    assert.equal(await second.page.$eval('[data-key="1"]', (button) => (button as HTMLButtonElement).disabled), true);
    api.release();
    await idle(first.page);
    await second.page.click('[data-testid="check-status"]'); await idle(second.page);
    assert.equal(await second.page.$eval('[data-key="2"]', (button) => (button as HTMLButtonElement).disabled), false);
    await second.page.click('[data-key="0"]'); await second.page.click('[data-key="0"]'); await idle(second.page);
    await first.page.click('[data-key="5"]'); await idle(first.page);
    assert.match(await first.page.$eval('[role="alert"]', (node) => node.textContent ?? ""), /shared demo changed/);
    assert.equal(await first.page.$eval('[data-key="1"]', (button) => (button as HTMLButtonElement).disabled), false);
    assert.deepEqual([...first.errors, ...second.errors], []);
  } finally {
    api.release();
    await Promise.all([first.context.close(), second.context.close()]);
    await api.close();
  }
});

test("unconfigured signing is explicitly unavailable, and scripted model output never completes an example", async () => {
  const h = await openHarness(browser);
  try {
    h.issuerConfigured = false;
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.match(await h.page.$eval(".request-feedback", (node) => node.textContent ?? ""), /Signing is not configured/);
    assert.equal(await h.page.$eval('[data-key="1"]', (button) => (button as HTMLButtonElement).disabled), true);
    h.issuerConfigured = true;
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    await h.page.click('[data-key="1"]'); await idle(h.page);
    h.runMode = "scripted";
    await h.page.click('[data-key="2"]'); await idle(h.page);
    assert.match(await h.page.$eval('[role="alert"]', (node) => node.textContent ?? ""), /scripted response/);
    assert.equal(await h.page.$eval('[data-key="3"]', (button) => (button as HTMLButtonElement).disabled), true);
  } finally { await h.context.close(); }
});
