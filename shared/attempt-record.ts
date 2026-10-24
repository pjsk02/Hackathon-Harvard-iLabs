import { isHexString, keccak256, toUtf8Bytes } from "ethers";
import type { AttemptRecord } from "./contract";
import { AGENT_ID, CHAIN_ID } from "./contract";

export const ATTEMPT_CHECK_IDS = ["signed", "agent", "valid", "stamped", "scope"] as const;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const attemptAgent = (agent: string): AttemptRecord["agent"] => agent === AGENT_ID ? AGENT_ID : "other";
export const attemptAction = (action: string): AttemptRecord["action"] =>
  action === "read_regional_margins" || action === "read_employee_salaries" ? action : "other";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const uint = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Strict, versioned, payload-free input. No object spreads or arbitrary JSON hashing. */
export function canonicalAttemptRecord(value: unknown): AttemptRecord {
  if (!object(value) ||
    !exactKeys(value, ["version", "attemptId", "receiptId", "chainId", "permissionFingerprint",
      "requestBlock", "agent", "action", "source", "decision", "checks"]) ||
    value.version !== 1 || value.chainId !== CHAIN_ID ||
    typeof value.attemptId !== "string" || !UUID_PATTERN.test(value.attemptId) ||
    typeof value.receiptId !== "string" || !/^r_[0-9]{3,16}$/.test(value.receiptId) ||
    !isHexString(value.permissionFingerprint, 32) ||
    !object(value.requestBlock) || !exactKeys(value.requestBlock, ["blockNumber", "blockHash", "blockTimestamp"]) ||
    !uint(value.requestBlock.blockNumber) || !uint(value.requestBlock.blockTimestamp) ||
    !isHexString(value.requestBlock.blockHash, 32) ||
    (value.agent !== AGENT_ID && value.agent !== "other") ||
    typeof value.action !== "string" || !["read_regional_margins", "read_employee_salaries", "other"].includes(value.action) ||
    (value.source !== "agent" && value.source !== "forced") ||
    (value.decision !== "ALLOWED" && value.decision !== "BLOCKED") ||
    !Array.isArray(value.checks) || value.checks.length !== 5 ||
    !value.checks.every((check, i) => object(check) && exactKeys(check, ["id", "pass"]) &&
      check.id === ATTEMPT_CHECK_IDS[i] && typeof check.pass === "boolean")) {
    throw new Error("The attempt record is not a valid version-one record.");
  }
  const record = value as unknown as AttemptRecord;
  return {
    version: 1, attemptId: record.attemptId.toLowerCase(), receiptId: record.receiptId, chainId: CHAIN_ID,
    permissionFingerprint: record.permissionFingerprint.toLowerCase(),
    requestBlock: {
      blockNumber: record.requestBlock.blockNumber,
      blockHash: record.requestBlock.blockHash.toLowerCase(),
      blockTimestamp: record.requestBlock.blockTimestamp,
    },
    agent: record.agent, action: record.action, source: record.source, decision: record.decision,
    checks: record.checks.map(({ id, pass }) => ({ id, pass })),
  };
}

export function attemptFingerprint(value: unknown): string {
  const r = canonicalAttemptRecord(value);
  return keccak256(toUtf8Bytes(JSON.stringify([
    "envoi.attempt.v1", r.version, r.attemptId, r.receiptId, r.chainId, r.permissionFingerprint,
    r.requestBlock.blockNumber, r.requestBlock.blockHash, r.requestBlock.blockTimestamp,
    r.agent, r.action, r.source, r.decision, r.checks.map(({ id, pass }) => [id, pass]),
  ])));
}
