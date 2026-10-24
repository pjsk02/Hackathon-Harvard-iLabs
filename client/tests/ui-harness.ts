// Browser-only test responses. Never imported by the application or sent to its server.
import type { Browser, HTTPRequest, Page } from "puppeteer-core";
import type { HealthResponse, Receipt, Slip, StateResponse } from "../../shared/contract";
import { AGENT_ID, MANDATE_ID, RESOURCE } from "../../shared/contract";
import { consulting } from "../../shared/scenarios";

export const permission: Slip = {
  label: "Original", signature: `0x${"1".repeat(130)}`, digest: `0x${"2".repeat(64)}`,
  mandate: { mandateId: MANDATE_ID, issuer: `0x${"3".repeat(40)}`, agentId: AGENT_ID,
    resource: RESOURCE, scenarioId: "consulting", allowedActions: ["read_regional_margins"],
    issuedAt: 1792800000, expiresAt: 1793400000, nonce: "12345678" },
  anchor: { txHash: `0x${"4".repeat(64)}`, blockNumber: 123, blockTimestamp: 1792800001,
    explorerUrl: `https://testnet.monadvision.com/tx/0x${"4".repeat(64)}` },
};
function receipt(index: number, allowed: boolean): Receipt {
  return {
    id: `ui-only-${index}`, kind: "action", source: "agent", createdAt: "2026-10-24T12:00:00Z",
    agentId: AGENT_ID, mandateId: MANDATE_ID, actionTime: 1792800002,
    action: allowed ? "read_regional_margins" : "read_employee_salaries",
    decision: allowed ? "ALLOWED" : "BLOCKED",
    checks: (["signed", "agent", "valid", "stamped", "scope"] as const).map((id) => ({
      id, label: id, pass: allowed || id !== "scope",
      detail: !allowed && id === "scope" ? "Employee compensation is not on this slip." : "Check passed.",
    })),
    // Invented test-only rows; never copied from protected server data.
    data: allowed ? [{ region: "Test A", marginPct: 1 }, { region: "Test B", marginPct: 2 }, { region: "Test C", marginPct: 3 }] : null,
    explorerUrl: permission.anchor!.explorerUrl,
  };
}

export async function openHarness(browser: Browser, path = "/") {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1152, height: 720 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const state: StateResponse = { scenario: structuredClone(consulting), slips: [], receipts: [], counter: 0 };
  const harness = {
    context, page, state, calls: [] as { path: string; body: any; method: string; headers: Record<string, string> }[], errors: [] as string[],
    reconciled: null as Receipt | null, reconcileError: false, selftestSuccess: false,
    health: null as HealthResponse | null,
    grantMode: "success" as "success" | "failure" | "network" | "hold" | "invalid",
    badState: false, badHealth: false, held: null as HTTPRequest | null,
  };
  page.on("pageerror", (error) => harness.errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) { await request.continue(); return; }
    harness.calls.push({ path: url.pathname, body: request.postData() ? JSON.parse(request.postData()!) : null,
      method: request.method(), headers: request.headers() });
    const send = (value: unknown, status = 200) => request.respond({
      status, contentType: "application/json", body: JSON.stringify(value),
    });
    if (/^\/api\/attempts\/[^/]+\/reconcile$/.test(url.pathname)) {
      if (harness.reconcileError || !harness.reconciled) await send({ error: "Attempt status is unavailable. Check again manually." }, 503);
      else {
        state.receipts = state.receipts.map((r) => r.id === harness.reconciled!.id ? harness.reconciled! : r);
        await send(harness.reconciled);
      }
      return;
    }
    switch (url.pathname) {
      case "/api/health":
        await send(harness.badHealth ? { error: "Health unavailable." } : harness.health ??
          { ok: true, mockChain: false, issuer: permission.mandate.issuer, rpc: "https://test.invalid" }, harness.badHealth ? 503 : 200);
        break;
      case "/api/state":
        if (harness.badState) await request.respond({ status: 200, body: "<html>Not JSON</html>" });
        else await send(state);
        break;
      case "/api/slips":
        if (harness.grantMode === "failure") await send({ error: "The Monad connection is not built yet." }, 502);
        else if (harness.grantMode === "network") await request.abort("failed");
        else if (harness.grantMode === "invalid") await send({ ok: true });
        else if (harness.grantMode === "hold") harness.held = request;
        else { state.slips = [structuredClone(permission)]; await send(permission); }
        break;
      case "/api/agent/run": {
        const body = JSON.parse(request.postData()!);
        const receipts = body.reportId === "clean" ? [receipt(++state.counter, true)]
          : [receipt(++state.counter, true), receipt(++state.counter, false)];
        state.receipts.unshift(...receipts.toReversed());
        await send({ transcript: "Test-only browser response.", proposedCalls: receipts.map((r) => r.action), receipts });
        break;
      }
      case "/api/reset":
        state.slips = []; state.receipts = []; state.counter = 0;
        await send({ ok: true });
        break;
      case "/api/selftest":
        if (request.method() === "GET") await send({ pass: false, steps: [] });
        else if (harness.selftestSuccess) await send({ pass: true, steps: [] });
        else await send({ error: "The self-test is not built yet." }, 501);
        break;
      default:
        // Fail closed: never allow an unhandled fixture route to hit a live server.
        await send({ error: `Unexpected test request: ${url.pathname}` }, 400);
    }
  });
  const base = process.env.ENVOI_TEST_BASE_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  if (!base) throw new Error("Set ENVOI_TEST_BASE_URL to the running development app.");
  await page.goto(new URL(path, base).href, { waitUntil: "networkidle0" });
  await page.waitForSelector('[data-testid="check-status"]:not([disabled])');
  return harness;
}

export async function idle(page: Page) {
  await page.waitForFunction(() => document.querySelector("[data-demo-busy]")?.getAttribute("data-demo-busy") === "false");
}

export async function uploadText(page: Page, name: string, text: string) {
  await page.$eval('input[type="file"]', (input, value) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([value.text], value.name));
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { name, text });
  await idle(page);
}
