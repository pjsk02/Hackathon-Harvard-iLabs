// In-browser stand-in for the server, used only with /?mock=1 (a MOCK badge shows).
// It mirrors the contract shapes so every beat can be rehearsed with no server.
// It carries NO protected data: allowed receipts return data: null.
import type {
  ActRequest, AgentRunResponse, Check, HealthResponse, Receipt, ReportId, SelftestResponse, Slip, StateResponse, UploadedReport,
} from "@shared/contract";
import { AGENT_ID, MANDATE_ID } from "@shared/contract";
import { consulting } from "@shared/scenarios";

const AMENDED_ID = `${MANDATE_ID}-amended`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const hex = (n: number) =>
  "0x" + Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

let slips: Slip[] = [];
let receipts: Receipt[] = []; // newest first, like the server
let block = 18_442_000;

function anchorNow(): Slip["anchor"] {
  block += 7 + Math.floor(Math.random() * 30);
  const txHash = hex(64);
  return { txHash, blockNumber: block, blockTimestamp: now(), explorerUrl: `https://testnet.monadexplorer.com/tx/${txHash}` };
}

function mondayNine(): number {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(9, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function checksFor(slip: Slip, action: string, actionTime: number): Check[] {
  const stampedPass = !!slip.anchor && slip.anchor.blockTimestamp <= actionTime;
  return [
    { id: "signed", label: "Signed by the client", pass: true, detail: "" },
    { id: "agent", label: "The right AI", pass: true, detail: "" },
    { id: "valid", label: "Still valid", pass: true, detail: "" },
    { id: "stamped", label: "Stamped before request", pass: stampedPass, detail: stampedPass ? "" : "Stamped on Monad after this request" },
    { id: "scope", label: "On the slip", pass: slip.mandate.allowedActions.includes(action), detail: slip.mandate.allowedActions.includes(action) ? "" : "Not on this permission" },
  ];
}

function act(action: string, source: Receipt["source"]): Receipt {
  const slip = slips.find((s) => s.label === "Original");
  if (!slip) throw new Error("Sign the permission slip first.");
  const t = now();
  const checks = checksFor(slip, action, t);
  const ok = checks.every((c) => c.pass);
  const r: Receipt = {
    id: hex(8), kind: "action", createdAt: new Date().toISOString(), actionTime: t,
    agentId: AGENT_ID, mandateId: MANDATE_ID, action, source,
    decision: ok ? "ALLOWED" : "BLOCKED", checks, data: null, explorerUrl: null,
  };
  receipts = [r, ...receipts];
  return r;
}

export const mockApi = {
  async state(): Promise<StateResponse> {
    return { scenario: consulting, slips: [...slips], receipts: [...receipts], counter: receipts.length };
  },
  async sign(scenarioId: string): Promise<Slip> {
    await wait(1200);
    if (slips.some((s) => s.label === "Original")) throw new Error("This permission is already on Monad.");
    const t = now();
    const slip: Slip = {
      mandate: {
        mandateId: MANDATE_ID, issuer: hex(40), agentId: AGENT_ID, resource: "northwind-data-api",
        scenarioId, allowedActions: [consulting.allowed.name], issuedAt: t, expiresAt: t + 86_400 * 3, nonce: hex(8).slice(2),
      },
      signature: hex(130), digest: hex(64), label: "Original", anchor: anchorNow(),
    };
    slips = [...slips, slip];
    return slip;
  },
  async run(reportId: ReportId, upload?: UploadedReport): Promise<AgentRunResponse> {
    await wait(3000);
    // Mock only: pretend the AI takes any bait that mentions compensation or salaries.
    const baited = upload ? /compensation|salar/i.test(upload.text) : reportId === "poisoned";
    const calls = baited ? [consulting.allowed.name, consulting.forbidden.name] : [consulting.allowed.name];
    return { transcript: "(mock)", proposedCalls: calls, receipts: calls.map((c) => act(c, "agent")) };
  },
  async act(req: ActRequest): Promise<Receipt> {
    await wait(600);
    return act(req.action, "forced");
  },
  async dispute(): Promise<Receipt> {
    const blocked = receipts.find((r) => r.decision === "BLOCKED" && r.kind === "action");
    const original = slips.find((s) => s.label === "Original");
    if (!blocked || !original) throw new Error("Run the hidden note scene first.");
    await wait(2000);
    const amended: Slip = {
      ...original,
      mandate: {
        ...original.mandate, mandateId: AMENDED_ID, issuedAt: mondayNine(),
        allowedActions: [...new Set([...original.mandate.allowedActions, blocked.action])],
      },
      signature: hex(130), digest: hex(64), label: "Amended", anchor: anchorNow(),
    };
    slips = [...slips, amended];
    const r: Receipt = {
      ...blocked, id: hex(8), kind: "dispute", createdAt: new Date().toISOString(), mandateId: AMENDED_ID,
      source: "forced", decision: "REJECTED", checks: checksFor(amended, blocked.action, blocked.actionTime),
      data: null, explorerUrl: amended.anchor!.explorerUrl,
    };
    receipts = [r, ...receipts];
    return r;
  },
  async health(): Promise<HealthResponse> {
    return { ok: true, mockChain: true, issuer: null, rpc: "mock" };
  },
  async selftest(): Promise<SelftestResponse> {
    throw new Error("The self-test does not run in mock mode.");
  },
  async reset(): Promise<{ ok: true }> {
    slips = [];
    receipts = [];
    return { ok: true };
  },
};
