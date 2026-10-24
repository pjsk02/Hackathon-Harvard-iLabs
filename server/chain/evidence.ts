import type { Slip } from "../../shared/contract";
import { CHAIN_ID } from "../../shared/contract";
import { digestOf, issuerAddress, recoverSigner } from "./slip";

export type ChainReference = {
  chainId: number; blockNumber: number; blockHash: string; blockTimestamp: number;
};

export type LookupResult = ChainReference & {
  from: string; to: string; data: string; value: string;
  status: number; transactionIndex: number; finalized: true;
};

/** Proposed internal P2/P3 handoff; not an addition to the frozen public Receipt. */
export type OriginalRequestContext = {
  generation: number;
  originalSlip: Slip;
  requestBlock: ChainReference;
  agentId: string;
  action: string;
  resource: string;
  scenarioId: string;
};

/** P2 can adopt this without changing the frozen Receipt contract prematurely. */
export function stampMatchesRequest(
  slip: Slip,
  evidence: LookupResult | null,
  requestBlock: ChainReference,
  trustedIssuer = issuerAddress(),
): boolean {
  try {
    const digest = digestOf(slip.mandate).toLowerCase();
    const issuer = trustedIssuer.toLowerCase();
    return !!slip.anchor && !!evidence && evidence.finalized === true &&
      requestBlock.chainId === CHAIN_ID && evidence.chainId === CHAIN_ID &&
      /^0x[a-f0-9]{64}$/i.test(requestBlock.blockHash) &&
      /^0x[a-f0-9]{64}$/i.test(evidence.blockHash) &&
      Number.isSafeInteger(requestBlock.blockNumber) && requestBlock.blockNumber >= 0 &&
      Number.isSafeInteger(evidence.blockNumber) && evidence.blockNumber >= 0 &&
      slip.mandate.issuer.toLowerCase() === issuer &&
      recoverSigner(slip.mandate, slip.signature).toLowerCase() === issuer &&
      slip.digest.toLowerCase() === digest &&
      evidence.from.toLowerCase() === issuer && evidence.to.toLowerCase() === issuer &&
      BigInt(evidence.value) === 0n && evidence.status === 1 && evidence.data.toLowerCase() === digest &&
      evidence.blockNumber === slip.anchor.blockNumber &&
      evidence.blockTimestamp === slip.anchor.blockTimestamp &&
      evidence.blockNumber <= requestBlock.blockNumber &&
      (evidence.blockNumber !== requestBlock.blockNumber ||
        evidence.blockHash.toLowerCase() === requestBlock.blockHash.toLowerCase());
  } catch {
    return false;
  }
}
