import type { Anchor, Check, Receipt } from "@shared/contract";
import { shownChecks } from "../labels";

/** A receipt has no attempt anchor. Only a slip's complete anchor is evidence. */
export function recordedAnchor(anchor: Anchor | null): Anchor | null {
  if (!anchor || !/^0x[0-9a-f]{64}$/i.test(anchor.txHash)
    || /^0x([0-9a-f])\1{63}$/i.test(anchor.txHash)
    || !Number.isSafeInteger(anchor.blockNumber) || anchor.blockNumber <= 0
    || !Number.isFinite(anchor.blockTimestamp) || anchor.blockTimestamp <= 0) return null;
  try {
    const url = new URL(anchor.explorerUrl);
    const explorer = /^(testnet\.)?(monadvision\.com|monadexplorer\.com)$/i.test(url.hostname);
    return url.protocol === "https:" && explorer
      && url.pathname.toLowerCase() === `/tx/${anchor.txHash.toLowerCase()}` ? anchor : null;
  } catch {
    return null;
  }
}

export function evidenceChecks(checks: Check[], action: string) {
  return shownChecks(checks, action).map((summary) => {
    const check = checks.find((entry) => entry.id === summary.id)!;
    return {
      ...summary,
      // Never substitute a timing explanation for an RPC/signature/other failure.
      text: check.pass ? summary.text : (check.detail.trim() || `${check.label}: check failed`),
    };
  });
}

export function receiptShowsLatePermission(receipt: Receipt): boolean {
  if (receipt.kind !== "dispute" || receipt.decision !== "REJECTED") return false;
  const stamped = receipt.checks.find((check) => check.id === "stamped");
  // A failed RPC is not evidence that a permission was recorded too late.
  const failure = /\b(rpc|unavailable|failed|error|timeout|unable)\b|timed out|could not|couldn't/i;
  return !!stamped && !stamped.pass
    && /\bafter\b.*\brequest\b/i.test(stamped.detail)
    && !receipt.checks.some((check) => !check.pass && failure.test(check.detail));
}

export function profitabilityRows(receipt: Receipt | null | undefined) {
  if (receipt?.decision !== "ALLOWED" || receipt.action !== "read_regional_margins"
    || !Array.isArray(receipt.data)) return [];
  return receipt.data.flatMap((value: unknown, index: number) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const region = Object.entries(row).find(([key, entry]) => /region/i.test(key) && typeof entry === "string")?.[1];
    const margin = Object.entries(row).find(([key, entry]) => /margin/i.test(key) && typeof entry === "number" && Number.isFinite(entry))?.[1];
    return typeof region === "string" && typeof margin === "number" ? [{ region, margin, index }] : [];
  });
}
