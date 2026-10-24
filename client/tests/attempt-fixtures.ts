// Browser/unit fixtures only. No signing, model, RPC, or protected payload.
import type { Receipt, Slip } from "../../shared/contract";
import { AGENT_ID, EXPLORER_TX_URL, MANDATE_ID, RESOURCE } from "../../shared/contract";
import { attemptFingerprint } from "../../shared/attempt-record";

export const permission: Slip = {
  label: "Original", signature: `0x${"12".repeat(65)}`, digest: `0x${"34".repeat(32)}`,
  mandate: { mandateId: MANDATE_ID, issuer: `0x${"56".repeat(20)}`, agentId: AGENT_ID,
    resource: RESOURCE, scenarioId: "consulting", allowedActions: ["read_regional_margins"],
    issuedAt: 1792800000, expiresAt: 1793400000, nonce: "12345678" },
  anchor: { txHash: `0x${"78".repeat(32)}`, blockNumber: 123, blockTimestamp: 1792800001,
    explorerUrl: `${EXPLORER_TX_URL}0x${"78".repeat(32)}` },
};

export function attemptReceipt(status: "absent" | "pending" | "recorded" | "failed" = "recorded"): Receipt {
  const receipt: Receipt = {
    id: "r_001", kind: "action", createdAt: "2026-10-24T12:00:00Z", actionTime: 1792800002,
    agentId: AGENT_ID, mandateId: MANDATE_ID, action: "read_employee_salaries",
    source: "agent", decision: "BLOCKED", data: null, explorerUrl: permission.anchor!.explorerUrl,
    checks: (["signed", "agent", "valid", "stamped", "scope"] as const).map((id) => ({
      id, label: id, pass: id !== "scope", detail: id === "scope" ? "Employee compensation is not on this slip." : "Check passed.",
    })),
  };
  if (status === "absent") return receipt;
  const record = {
    version: 1 as const, attemptId: "521694b4-320e-4c1b-98ab-c0778765a432", receiptId: receipt.id,
    chainId: 10143 as const, permissionFingerprint: permission.digest,
    requestBlock: { blockNumber: 124, blockTimestamp: receipt.actionTime, blockHash: `0x${"9a".repeat(32)}` },
    agent: AGENT_ID as "atlas-research-agent", action: "read_employee_salaries" as const,
    source: receipt.source, decision: "BLOCKED" as const,
    checks: receipt.checks.map(({ id, pass }) => ({ id, pass })),
  };
  const txHash = `0x${"bc".repeat(32)}`;
  receipt.attemptEvidence = status === "recorded"
    ? { status, record, fingerprint: attemptFingerprint(record), txHash,
      anchor: { txHash, blockNumber: 125, blockTimestamp: receipt.actionTime + 1, explorerUrl: `${EXPLORER_TX_URL}${txHash}` } }
    : { status, record, fingerprint: attemptFingerprint(record), txHash: null, anchor: null, detail: "Private upstream response must not be rendered." };
  return receipt;
}
