// STUB (owner: P1). Replace with the real EIP-712 slip code (see the eip712-slip skill).
// Keeps the same exports so routes and the gateway compile and run on the mock chain.
import { id } from "ethers";
import type { Mandate } from "../../shared/contract";
import { AGENT_ID, MANDATE_ID, RESOURCE } from "../../shared/contract";

const STUB_ISSUER = "0x3f9a000000000000000000000000000000c21e";

export const issuerAddress = (): string => STUB_ISSUER;

export function buildMandate(input: {
  scenarioId: string;
  allowedActions: string[];
  mandateId?: string;
  issuedAt?: number;
  expiresAt?: number;
}): Mandate {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000) - 60;
  return {
    mandateId: input.mandateId ?? MANDATE_ID,
    issuer: issuerAddress(),
    agentId: AGENT_ID,
    resource: RESOURCE,
    scenarioId: input.scenarioId,
    allowedActions: [...input.allowedActions].sort(),
    issuedAt,
    expiresAt: input.expiresAt ?? issuedAt + 5 * 24 * 3600,
    nonce: Math.random().toString(16).slice(2, 10).padEnd(8, "0"),
  };
}

export const digestOf = (m: Mandate): string => id(JSON.stringify(m));

export async function signMandate(m: Mandate): Promise<{ signature: string; digest: string }> {
  return { signature: "0xstub" + "0".repeat(126), digest: digestOf(m) };
}

export const recoverSigner = (_m: Mandate, _signature: string): string => issuerAddress();
