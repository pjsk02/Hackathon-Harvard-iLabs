import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { openHarness } from "./ui-harness";
import { verifiedHealth } from "./health-fixtures";

let browser: Browser;
before(async () => {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH ??
    ["/repl/tools/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
  if (!executablePath) throw new Error("Set CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");
  browser = await puppeteer.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
});
after(async () => { await browser?.close(); });

for (const path of ["/", "/?view=classic", "/?preflight=1"]) {
  test(`${path}: verified readiness replaces the legacy banner without executing any writes`, async () => {
    const h = await openHarness(browser, path);
    try {
      h.health = verifiedHealth();
      h.health.readiness!.recording.paused = true;
      await h.page.click('[data-testid="check-status"]');
      await h.page.waitForSelector('[data-connection-state="verified"]');
      await h.page.waitForFunction(() => !(document.querySelector('[data-testid="check-status"]') as HTMLButtonElement).disabled);
      const text = await h.page.$eval(".request-feedback", (element) => element.textContent!);
      assert.match(text, /Signing verified/);
      assert.match(text, /Monad testnet connected · finalized block 28,749,163/);
      assert.match(text, /Live recording paused/);
      assert.match(text, /AI configured; no live model test performed/);
      assert.doesNotMatch(text, /not yet verified|Server unavailable|rpc\.fixture/);
      if (path === "/?preflight=1") {
        const button = '#preflight-selftest + p ~ button';
        await h.page.click('input[type="checkbox"]');
        assert.equal(await h.page.$eval(button, (b) => (b as HTMLButtonElement).disabled), true);
        h.health.readiness!.recording.paused = false;
        h.health.readiness!.recording.remaining = 4;
        await h.page.click('[data-testid="check-status"]');
        await h.page.waitForFunction(() => !(document.querySelector('#preflight-selftest + p ~ button') as HTMLButtonElement).disabled);
        assert.match((await h.page.$eval(".preflight-config", (e) => e.textContent!)), /Signing verified.*Monad testnet connected.*AI configured/s);
      } else {
        const selector = path === "/" ? ".grant .primary" : ".controls button";
        assert.equal(await h.page.$eval(selector, (b) => (b as HTMLButtonElement).disabled), true);
      }
      assert.equal(h.calls.filter((call) => call.method !== "GET").length, 0);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  });
}
