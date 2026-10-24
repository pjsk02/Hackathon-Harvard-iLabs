import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { idle, openHarness } from "./ui-harness";
import { attemptReceipt, permission } from "./attempt-fixtures";
import { verifiedHealth } from "./health-fixtures";

let browser: Browser;
before(async () => {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH ??
    ["/repl/tools/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
  if (!executablePath) throw new Error("Set CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");
  browser = await puppeteer.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
});
after(async () => { await browser?.close(); });

for (const path of ["/", "/?view=classic"]) {
  test(`${path}: pending evidence rechecks only on click, then independently confirms the attempt`, async () => {
    const h = await openHarness(browser, path);
    try {
      h.state.slips = [structuredClone(permission)];
      h.state.receipts = [attemptReceipt("pending")];
      h.state.counter = 1;
      h.reconciled = attemptReceipt();
      await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
      assert.equal(h.calls.filter((c) => c.path.endsWith("/reconcile")).length, 0);
      assert.equal(await h.page.$$eval('[data-attempt-evidence="pending"] a', (links) => links.length), 0);
      await h.page.$eval('[aria-label="Recheck attempt record for r_001"]', (button) => {
        (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
      });
      await h.page.waitForSelector('[data-attempt-evidence="recorded"] a'); await idle(h.page);
      const posts = h.calls.filter((c) => c.path.endsWith("/reconcile"));
      assert.equal(posts.length, 1);
      assert.equal(posts[0].method, "POST");
      assert.equal(posts[0].headers["idempotency-key"], undefined);
      assert.equal(await h.page.$eval('[data-attempt-evidence="recorded"] a', (a) => a.getAttribute("href")), h.reconciled.attemptEvidence!.status === "recorded" ? h.reconciled.attemptEvidence!.anchor.explorerUrl : "");
      assert.ok((await h.page.$eval(path === "/" ? "#monad-evidence" : "#classic-record", (e) => e.textContent))?.includes("1 permission records · 1 attempt records"));
      assert.ok((await h.page.$eval(path === "/" ? ".stamp" : "#classic-record", (e) => e.textContent))?.includes("BLOCKED"));
      assert.equal(h.calls.filter((c) => c.path === "/api/act" || c.path === "/api/agent/run").length, 0);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  });
}

test("recheck error preserves the decision and pending state, with manual retry and no automatic repeat", async () => {
  const h = await openHarness(browser);
  try {
    h.state.slips = [structuredClone(permission)]; h.state.receipts = [attemptReceipt("pending")]; h.state.counter = 1;
    h.reconcileError = true;
    await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
    await h.page.click('[aria-label="Recheck attempt record for r_001"]');
    await h.page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Attempt status is unavailable"));
    await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path.endsWith("/reconcile")).length, 1);
    assert.equal(await h.page.$eval(".stamp", (e) => e.textContent), "BLOCKED");
    assert.equal(await h.page.$eval('[aria-label="Recheck attempt record for r_001"]', (b) => (b as HTMLButtonElement).disabled), false);
    assert.equal(await h.page.$$eval('[data-attempt-evidence] a', (a) => a.length), 0);
    h.reconcileError = false; h.reconciled = attemptReceipt("failed");
    await h.page.click('[aria-label="Recheck attempt record for r_001"]');
    await h.page.waitForSelector('[data-attempt-evidence="failed"]'); await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path.endsWith("/reconcile")).length, 2);
    assert.equal(await h.page.$$eval('[data-attempt-evidence] button', (b) => b.length), 0);
  } finally { await h.context.close(); }
});

test("forged evidence does not hide BLOCKED or replace permission links", async () => {
  const h = await openHarness(browser);
  try {
    h.state.slips = [structuredClone(permission)]; h.state.receipts = [attemptReceipt()]; h.state.counter = 1;
    h.state.receipts[0].attemptEvidence!.fingerprint = "private-invalid-record";
    await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
    assert.match((await h.page.$eval('[data-attempt-evidence="invalid"]', (e) => e.textContent))!, /Record could not be verified/);
    assert.equal(await h.page.$eval(".stamp", (e) => e.textContent), "BLOCKED");
    assert.equal(await h.page.$$eval('[data-attempt-evidence] a', (a) => a.length), 0);
    assert.equal(await h.page.$eval(".block-top a", (a) => a.getAttribute("href")), permission.anchor!.explorerUrl);
    assert.ok(!(await h.page.$eval("body", (e) => e.textContent))!.includes("private-invalid-record"));
  } finally { await h.context.close(); }
});

test("browser act/run requests carry UUID v4 identity; checking status never repeats them", async () => {
  const h = await openHarness(browser);
  try {
    await h.page.click(".grant .primary"); await idle(h.page);
    await h.page.click('[data-key="2"]'); await idle(h.page);
    const run = h.calls.filter((c) => c.path === "/api/agent/run");
    assert.equal(run.length, 1);
    assert.match(run[0].headers["idempotency-key"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await h.page.click('[data-testid="check-status"]'); await idle(h.page);
    assert.equal(h.calls.filter((c) => c.path === "/api/agent/run").length, 1);
  } finally { await h.context.close(); }
});

test("self-test requires explicit four-transaction confirmation and an empty session", async () => {
  const h = await openHarness(browser, "/?preflight=1");
  try {
    h.health = verifiedHealth();
    await h.page.click('[data-testid="check-status"]');
    await h.page.waitForSelector('[data-connection-state="verified"]');
    await h.page.waitForFunction(() => !(document.querySelector('[data-testid="check-status"]') as HTMLButtonElement).disabled);
    const button = '#preflight-selftest + p ~ button';
    assert.equal(await h.page.$eval(button, (b) => (b as HTMLButtonElement).disabled), true);
    assert.equal(h.calls.filter((c) => c.path === "/api/selftest").length, 0);
    h.state.slips = [structuredClone(permission)];
    await h.page.click('input[type="checkbox"]'); await h.page.click(button);
    await h.page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("requires an empty session"));
    await h.page.waitForFunction(() => !(document.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled);
    assert.equal(h.calls.filter((c) => c.path === "/api/selftest").length, 0);
    h.state.slips = []; h.selftestSuccess = true;
    await h.page.click('input[type="checkbox"]'); await h.page.click(button);
    await h.page.waitForFunction(() => document.body.textContent?.includes("Self-test reported all scenes passed."));
    assert.deepEqual(h.calls.filter((c) => c.path === "/api/selftest").map((c) => c.method), ["POST"]);
  } finally { await h.context.close(); }
});
