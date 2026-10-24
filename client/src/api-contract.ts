// Defensive shape checks at the browser boundary, not proof of chain validity.
import type { AgentRunResponse, HealthResponse, Receipt, SelftestResponse, Slip, StateResponse } from "@shared/contract";

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(text);

export function isSlip(value: unknown): value is Slip {
  if (!record(value) || !record(value.mandate)) return false;
  const m = value.mandate;
  return ["Original", "Amended"].includes(value.label) && text(value.signature) && text(value.digest) &&
    ["mandateId", "issuer", "agentId", "resource", "scenarioId", "nonce"].every((key) => text(m[key])) &&
    strings(m.allowedActions) && number(m.issuedAt) && number(m.expiresAt) &&
    (value.anchor === null || (record(value.anchor) && text(value.anchor.txHash) && text(value.anchor.explorerUrl) &&
      number(value.anchor.blockNumber) && number(value.anchor.blockTimestamp)));
}

export function hasRecordedPermission(value: Slip): boolean {
  return /^0x[0-9a-f]{130}$/i.test(value.signature) && /^0x[0-9a-f]{64}$/i.test(value.digest) &&
    !!value.anchor && /^0x[0-9a-f]{64}$/i.test(value.anchor.txHash) && value.anchor.blockNumber > 0 &&
    value.anchor.blockTimestamp > 0;
}

export function isReceipt(value: unknown): value is Receipt {
  return record(value) && ["id", "createdAt", "agentId", "mandateId", "action"].every((key) => text(value[key])) &&
    ["action", "dispute"].includes(value.kind) && ["agent", "forced"].includes(value.source) &&
    ["ALLOWED", "BLOCKED", "REJECTED"].includes(value.decision) && number(value.actionTime) &&
    (value.explorerUrl === null || text(value.explorerUrl)) && "data" in value &&
    (value.decision === "ALLOWED" ? value.kind === "action" : value.data === null) &&
    Array.isArray(value.checks) && value.checks.length === 5 &&
    ["signed", "agent", "valid", "stamped", "scope"].every((id, index) => {
      const c = value.checks[index];
      return record(c) && c.id === id && typeof c.pass === "boolean" && text(c.label) && text(c.detail) &&
        (value.decision !== "ALLOWED" || c.pass);
    });
}

export function isState(value: unknown): value is StateResponse {
  if (!record(value) || !record(value.scenario)) return false;
  const s = value.scenario;
  return text(s.id) && text(s.title) && text(s.task) && text(s.validUntilLabel) &&
    record(s.client) && text(s.client.name) && text(s.client.person) && record(s.firm) && text(s.firm.name) &&
    record(s.agent) && ["id", "name", "role"].every((key) => text(s.agent[key])) &&
    [s.allowed, s.forbidden].every((a) => record(a) && text(a.name) && text(a.label)) &&
    record(s.reports) && text(s.reports.clean) && text(s.reports.poisoned) &&
    Array.isArray(value.slips) && value.slips.every(isSlip) && Array.isArray(value.receipts) && value.receipts.every(isReceipt) &&
    number(value.counter) && Number.isInteger(value.counter) && value.counter >= 0;
}

export const isHealth = (value: unknown): value is HealthResponse =>
  record(value) && typeof value.ok === "boolean" && typeof value.mockChain === "boolean" &&
  (value.issuer === null || text(value.issuer)) && text(value.rpc);

export const isRun = (value: unknown): value is AgentRunResponse =>
  record(value) && text(value.transcript) && strings(value.proposedCalls) &&
  Array.isArray(value.receipts) && value.receipts.length <= 3 &&
  value.receipts.every((receipt: unknown) => isReceipt(receipt) && receipt.source === "agent" && receipt.kind === "action");

export const isSelftest = (value: unknown): value is SelftestResponse =>
  record(value) && typeof value.pass === "boolean" && Array.isArray(value.steps) &&
  value.steps.every((s: unknown) => record(s) && ["scene", "expected", "got"].every((key) => text(s[key])) && number(s.ms));
