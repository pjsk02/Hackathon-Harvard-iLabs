// Permission slip: EIP-712 typed data signed by the issuer wallet (owner: P1;
// written from the eip712-slip skill). The digest (typed-data hash) is what
// goes on Monad. Recovering the signer proves who approved; the stamp proves when.
import { TypedDataEncoder, Wallet, hexlify, randomBytes, verifyTypedData } from "ethers";
import type { Mandate } from "../../shared/contract";
import { AGENT_ID, CHAIN_ID, MANDATE_ID, RESOURCE } from "../../shared/contract";

export const DOMAIN = { name: "Envoi", version: "1", chainId: CHAIN_ID } as const;
// Field order matters: it changes the digest. Do NOT add EIP712Domain here.
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

let wallet: Wallet | null = null;
function signer(): Wallet {
  if (!process.env.ISSUER_PRIVATE_KEY) throw new Error("ISSUER_PRIVATE_KEY is not set");
  return (wallet ??= new Wallet(process.env.ISSUER_PRIVATE_KEY));
}

export const issuerAddress = (): string => signer().address;

export function buildMandate(input: {
  scenarioId: string;
  allowedActions: string[];
  mandateId?: string;
  issuedAt?: number;
  expiresAt?: number;
}): Mandate {
  // 60 s grace: actionTime is CHAIN time; if the server clock runs ahead, a fresh slip would fail "valid".
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000) - 60;
  return {
    mandateId: input.mandateId ?? MANDATE_ID,
    issuer: issuerAddress(),
    agentId: AGENT_ID,
    resource: RESOURCE,
    scenarioId: input.scenarioId,
    allowedActions: [...input.allowedActions].sort(), // canonical order: order changes the digest
    issuedAt,
    expiresAt: input.expiresAt ?? issuedAt + 5 * 24 * 3600,
    nonce: hexlify(randomBytes(4)).slice(2), // 8 hex chars
  };
}

function assertExactKeys(m: object) {
  const want = TYPES.Mandate.map((f) => f.name).sort().join(",");
  const got = Object.keys(m).sort().join(",");
  if (want !== got) throw new Error(`Mandate fields do not match the signed type: ${got}`);
}

export const digestOf = (m: Mandate): string => {
  assertExactKeys(m);
  return TypedDataEncoder.hash(DOMAIN, TYPES, m);
};

export async function signMandate(m: Mandate): Promise<{ signature: string; digest: string }> {
  assertExactKeys(m);
  const signature = await signer().signTypedData(DOMAIN, TYPES, m);
  return { signature, digest: TypedDataEncoder.hash(DOMAIN, TYPES, m) };
}

export const recoverSigner = (m: Mandate, signature: string): string => {
  assertExactKeys(m);
  return verifyTypedData(DOMAIN, TYPES, m, signature);
};
