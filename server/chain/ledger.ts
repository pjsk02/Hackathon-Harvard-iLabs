// Real Monad testnet ledger (owner: P1; written from the monad-anchor skill).
// An anchor is a zero-value transaction from the issuer to itself whose data
// field is the slip's EIP-712 digest. No network calls at import time.
import { JsonRpcProvider, Wallet } from "ethers";
import type { Anchor } from "../../shared/contract";
import { CHAIN_ID, EXPLORER_TX_URL } from "../../shared/contract";

export type LookupResult = {
  from: string;
  data: string;
  blockNumber: number;
  blockTimestamp: number;
  status: number;
};

const URLS = [
  process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
];
const explorer = (h: string) => `${EXPLORER_TX_URL}${h}`;

// staticNetwork: skip chainId probing. batchMaxCount 1: monadinfra rejects JSON-RPC batches.
let providerList: JsonRpcProvider[] | null = null;
function providers(): JsonRpcProvider[] {
  return (providerList ??= URLS.map((u) => {
    const p = new JsonRpcProvider(u, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
    p.pollingInterval = 300; // ethers' default 4000 ms would add up to 4 s to every wait()
    return p;
  }));
}

function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Monad did not answer in time")), ms)),
  ]);
}

// Read calls: try the primary RPC, then retry once on the next URL.
async function read<T>(fn: (p: JsonRpcProvider) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const p of providers().slice(0, 2)) {
    try {
      return await withTimeout(fn(p));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

let wallet: Wallet | null = null;
function issuer(): Wallet {
  if (!process.env.ISSUER_PRIVATE_KEY) throw new Error("ISSUER_PRIVATE_KEY is not set");
  return (wallet ??= new Wallet(process.env.ISSUER_PRIVATE_KEY, providers()[0]));
}

/** Test MON left in the issuer wallet, as a decimal string. */
export async function issuerBalance(): Promise<string> {
  const w = issuer();
  const wei = await read((p) => p.getBalance(w.address));
  return (Number(wei) / 1e18).toFixed(4);
}

// Single-file queue: on Monad, "pending" nonce == "latest", so two quick sends collide.
let queue: Promise<unknown> = Promise.resolve();
export function anchor(digest: string): Promise<Anchor> {
  const job = queue.then(async (): Promise<Anchor> => {
    const w = issuer();
    const tx = await withTimeout(
      w.sendTransaction({
        to: w.address,
        value: 0n,
        data: digest,
        chainId: CHAIN_ID,
        gasLimit: 30000n, // Monad bills the gas LIMIT; 21000 + 16/non-zero byte of a 32-byte payload is <= 21512
      }),
    );
    let rc;
    try {
      rc = await tx.wait(1, 10000);
    } catch (e) {
      // Timed out after broadcast: check once before giving up, otherwise the next send may reuse the nonce.
      const seen = await lookup(tx.hash).catch(() => null);
      if (!seen) throw e;
      return { txHash: tx.hash, blockNumber: seen.blockNumber, blockTimestamp: seen.blockTimestamp, explorerUrl: explorer(tx.hash) };
    }
    if (!rc || rc.status !== 1) throw new Error("The notary stamp transaction failed on Monad");
    const block = await read((p) => p.getBlock(rc.blockNumber));
    return { txHash: tx.hash, blockNumber: rc.blockNumber, blockTimestamp: Number(block!.timestamp), explorerUrl: explorer(tx.hash) };
  });
  queue = job.catch(() => undefined);
  return job;
}

const cache = new Map<string, LookupResult>();
export async function lookup(txHash: string): Promise<LookupResult | null> {
  const hit = cache.get(txHash);
  if (hit) return hit;
  const tx = await read((p) => p.getTransaction(txHash));
  if (!tx || tx.blockNumber == null) return null; // unknown, or not yet mined (Monad's mempool is not queryable)
  const rc = await read((p) => p.getTransactionReceipt(txHash));
  const block = await read((p) => p.getBlock(tx.blockNumber!));
  const out: LookupResult = {
    from: tx.from,
    data: tx.data,
    blockNumber: tx.blockNumber,
    blockTimestamp: Number(block!.timestamp),
    status: rc?.status ?? 0,
  };
  cache.set(txHash, out); // mined transactions never change
  return out;
}

export async function latestTimestamp(): Promise<number> {
  try {
    const b = await read((p) => p.getBlock("latest"));
    return Number(b!.timestamp);
  } catch {
    console.warn("latestTimestamp: falling back to the server clock");
    return Math.floor(Date.now() / 1000);
  }
}
