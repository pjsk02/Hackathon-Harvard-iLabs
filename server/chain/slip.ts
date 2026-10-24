import { getAddress, hexlify, randomBytes, TypedDataEncoder, verifyMessage, verifyTypedData, Wallet } from "ethers";
import type { Mandate } from "../../shared/contract";
import { AGENT_ID, CHAIN_ID, MANDATE_ID, RESOURCE } from "../../shared/contract";

export const DOMAIN = { name: "Envoi", version: "1", chainId: CHAIN_ID } as const;
export const TYPES = {
  Mandate: [
    { name: "mandateId", type: "string" },
    { name: "issuer", type: "address" },
    { name: "agentId", type: "string" },
    { name: "resource", type: "string" },
    { name: "scenarioId", type: "string" },
    { name: "allowedActions", type: "string[]" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "string" },
  ],
};

function issuerWallet(): Wallet {
  if (!process.env.ISSUER_PRIVATE_KEY) throw new Error("ISSUER_PRIVATE_KEY is not configured.");
  try {
    return new Wallet(process.env.ISSUER_PRIVATE_KEY);
  } catch {
    throw new Error("ISSUER_PRIVATE_KEY must be a valid test wallet private key.");
  }
}

export const issuerAddress = (): string => issuerWallet().address;

/** Local-only challenge, not a permission or a transaction. Never return the signature. */
export async function verifyIssuerSigning(): Promise<string> {
  const wallet = issuerWallet();
  const challenge = `Envoi local readiness check: ${hexlify(randomBytes(16))}`;
  const signature = await wallet.signMessage(challenge);
  if (verifyMessage(challenge, signature).toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("The local signing check failed.");
  }
  return wallet.address;
}

export function assertMandate(value: unknown): asserts value is Mandate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid permission slip.");
  const m = value as Mandate;
  const expected = TYPES.Mandate.map((field) => field.name).sort().join(",");
  if (Object.keys(m).sort().join(",") !== expected) throw new Error("Permission fields do not match the signed type.");
  for (const field of ["mandateId", "agentId", "resource", "scenarioId"] as const) {
    if (typeof m[field] !== "string" || !m[field].trim()) throw new Error(`Invalid permission ${field}.`);
  }
  getAddress(m.issuer);
  if (!Array.isArray(m.allowedActions) || m.allowedActions.length === 0 ||
      m.allowedActions.some((action) => typeof action !== "string" || !action.trim()) ||
      new Set(m.allowedActions).size !== m.allowedActions.length) throw new Error("Invalid permission actions.");
  for (const time of [m.issuedAt, m.expiresAt]) {
    // Reject milliseconds and dates beyond year 9999, in addition to floats/negative times.
    if (!Number.isSafeInteger(time) || time < 0 || time > 253402300799) throw new Error("Permission times must be Unix seconds.");
  }
  if (m.expiresAt <= m.issuedAt) throw new Error("Permission expiry must follow its start.");
  if (!/^[a-fA-F0-9]{8}$/.test(m.nonce)) throw new Error("Permission nonce must contain eight hex characters.");
}

export function buildMandate(input: {
  scenarioId: string; allowedActions: string[]; mandateId?: string; issuedAt?: number; expiresAt?: number;
}): Mandate {
  // Routes pass chain time. The default is only for offline callers, never gateway verification.
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000) - 60;
  const mandate: Mandate = {
    mandateId: input.mandateId ?? MANDATE_ID,
    issuer: issuerAddress(),
    agentId: AGENT_ID,
    resource: RESOURCE,
    scenarioId: input.scenarioId,
    allowedActions: [...new Set(input.allowedActions)].sort(),
    issuedAt,
    expiresAt: input.expiresAt ?? issuedAt + 5 * 24 * 3600,
    nonce: hexlify(randomBytes(4)).slice(2),
  };
  assertMandate(mandate);
  return mandate;
}

export function digestOf(mandate: Mandate): string {
  assertMandate(mandate);
  return TypedDataEncoder.hash(DOMAIN, TYPES, mandate);
}

export async function signMandate(mandate: Mandate): Promise<{ signature: string; digest: string }> {
  const digest = digestOf(mandate);
  const wallet = issuerWallet();
  if (getAddress(mandate.issuer) !== wallet.address) throw new Error("Permission issuer does not match the configured wallet.");
  return { signature: await wallet.signTypedData(DOMAIN, TYPES, mandate), digest };
}

export function recoverSigner(mandate: Mandate, signature: string): string {
  assertMandate(mandate);
  return verifyTypedData(DOMAIN, TYPES, mandate, signature);
}
