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

test("empty preview explains the evidence flow without inventing records or links", async () => {
  const h = await openHarness(browser);
  try {
    assert.match((await h.page.$eval(".chain-empty-guide", (e) => e.textContent!)), /Grant permission, then run an example/);
    assert.equal(await h.page.$$eval("#monad-evidence a", (links) => links.length), 0);
    assert.equal(await h.page.$eval('[data-key="4"]', (button) => (button as HTMLButtonElement).disabled), true);
    assert.equal(h.calls.filter((call) => call.method !== "GET").length, 0);
  } finally { await h.context.close(); }
});

for (const mobile of [false, true]) {
  test(`Step 4 presents separate verified links and the latest decision on ${mobile ? "mobile" : "desktop"}`, async () => {
    const h = await openHarness(browser);
    try {
      h.health = verifiedHealth();
      h.state.slips = [structuredClone(permission)];
      h.state.receipts = [attemptReceipt()]; h.state.counter = 1;
      if (mobile) await h.page.setViewport({ width: 390, height: 844 });
      await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
      assert.equal(await h.page.$(".evidence-review"), null);
      await h.page.click('[data-key="4"]');
      await h.page.waitForSelector(".evidence-review");
      assert.equal(await h.page.evaluate(() => document.activeElement?.id), "monad-evidence");
      assert.equal(await h.page.$eval('[aria-current="step"]', (e) => e.textContent?.trim()), "4 Monad evidence");
      assert.equal(await h.page.$eval(".review-outcome", (e) => e.textContent), "BLOCKED");
      const links = await h.page.$$eval(".evidence-review .monad-record-link", (items) => items.map((a) => ({
        href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"), name: a.getAttribute("aria-label"),
      })));
      const evidence = h.state.receipts[0].attemptEvidence!;
      assert.equal(evidence.status, "recorded");
      assert.deepEqual(links.map((a) => a.href), [evidence.status === "recorded" ? evidence.anchor.explorerUrl : "", permission.anchor!.explorerUrl]);
      assert.ok(links.every((a) => a.target === "_blank" && a.rel?.includes("noopener") && a.rel.includes("noreferrer") && a.name?.includes("new tab")));
      assert.notEqual(links[0].href, links[1].href);
      assert.equal(await h.page.$$eval(".evidence-review iframe", (frames) => frames.length), 0);
      assert.ok((await h.page.$eval(".evidence-boundary", (e) => e.textContent!)).includes("not independent proof of AI reasoning"));
      const summary = await h.page.$(".record-technical summary");
      await summary!.click();
      assert.equal(await h.page.$eval(".record-technical", (e) => (e as HTMLDetailsElement).open), true);
      if (mobile) {
        const fits = await h.page.$$eval(".evidence-review-card", (cards) => cards.every((card) => {
          const r = card.getBoundingClientRect(); return r.width <= innerWidth && r.left >= 0 && r.right <= innerWidth;
        }));
        assert.equal(fits, true);
        assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.ok(await h.page.$(".evidence-history .block"));
      assert.ok(await h.page.$(".evidence-history .attempt-marker"));
      assert.equal(h.calls.filter((call) => call.method !== "GET").length, 0);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  });
}

for (const status of ["absent", "pending", "failed", "invalid"] as const) {
  test(`review ${status} evidence preserves the decision without a success link`, async () => {
    const h = await openHarness(browser);
    try {
      h.state.slips = [structuredClone(permission)];
      h.state.receipts = [attemptReceipt(status === "invalid" ? "recorded" : status)]; h.state.counter = 1;
      if (status === "invalid" && h.state.receipts[0].attemptEvidence!.status === "recorded") {
        h.state.receipts[0].attemptEvidence!.anchor = { ...permission.anchor! };
      }
      await h.page.reload({ waitUntil: "networkidle0" }); await idle(h.page);
      await h.page.click('[data-key="4"]');
      await h.page.waitForSelector(".evidence-review");
      assert.equal(await h.page.$eval(".review-outcome", (e) => e.textContent), "BLOCKED");
      assert.equal(await h.page.$$eval('[data-review-record="request"] a', (links) => links.length), 0);
      assert.equal(await h.page.$eval('[data-review-record="permission"] a', (a) => a.getAttribute("href")), permission.anchor!.explorerUrl);
      if (status === "pending") {
        h.reconciled = attemptReceipt();
        await h.page.click('[data-review-record="request"] button');
        await h.page.waitForSelector('[data-review-record="request"] .monad-record-link'); await idle(h.page);
        assert.equal(h.calls.filter((call) => call.path.endsWith("/reconcile")).length, 1);
        assert.equal(h.calls.filter((call) => call.path === "/api/act" || call.path === "/api/agent/run").length, 0);
      } else assert.equal(h.calls.filter((call) => call.method !== "GET").length, 0);
    } finally { await h.context.close(); }
  });
}
