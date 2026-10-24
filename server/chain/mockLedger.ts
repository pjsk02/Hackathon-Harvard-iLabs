// Explicit offline mode only. It still uses genuine EIP-712 signatures.
import { id, isHexString, randomBytes, hexlify } from "ethers";
import type { Anchor } from "../../shared/contract";
import { CHAIN_ID } from "../../shared/contract";
import type { ChainReference, LookupResult } from "./evidence";
import { issuerAddress } from "./slip";

export function createMockLedger(clock = () => Date.now()) {
  const epoch = clock();
  const store = new Map<string, LookupResult>();
  let block = 18_442_000;
  const blockHash = (height: number) => id(`envoi-mock-block-${height}`);
  const current = (): ChainReference => {
    block = Math.max(block, 18_442_000 + Math.floor((clock() - epoch) / 300));
    return { chainId: CHAIN_ID, blockNumber: block, blockHash: blockHash(block), blockTimestamp: Math.floor(clock() / 1000) };
  };
  return {
    async anchor(digest: string): Promise<Anchor> {
      if (!isHexString(digest, 32)) throw new Error("A stamp requires a 32-byte permission fingerprint.");
      const from = issuerAddress(); // no hardcoded or fabricated issuer
      current();
      block++;
      const ref = current();
      const txHash = hexlify(randomBytes(32));
      store.set(txHash, {
        ...ref, from, to: from, data: digest, value: "0x0",
        status: 1, transactionIndex: 0, finalized: true,
      });
      return { txHash, blockNumber: ref.blockNumber, blockTimestamp: ref.blockTimestamp, explorerUrl: "#mock" };
    },
    async lookup(txHash: string): Promise<LookupResult | null> {
      const result = store.get(txHash);
      return result ? { ...result } : null;
    },
    async latestReference(): Promise<ChainReference> { return current(); },
    async latestTimestamp(): Promise<number> { return current().blockTimestamp; },
    advanceBlocks(count = 1) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid mock block count.");
      block += count;
    },
  };
}

const ledger = createMockLedger();
export const { anchor, lookup, latestReference, latestTimestamp } = ledger;
