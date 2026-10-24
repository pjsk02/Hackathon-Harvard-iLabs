import { isHexString, keccak256, Wallet } from "ethers";
import type { Anchor } from "../../shared/contract";
import { CHAIN_ID, EXPLORER_TX_URL } from "../../shared/contract";
import type { ChainReference, LookupResult } from "./evidence";
import { ChainError, RpcWriteError, createRpcClient, remaining, type RpcCall } from "./rpc";
import { chainDeadline } from "./deadline";
export type { ChainReference, LookupResult } from "./evidence";

type Block = { number: string; hash: string; timestamp: string };
type Transaction = { hash: string; from: string; to: string | null; input: string; value: string; blockNumber: string | null; blockHash: string | null };
type TransactionReceipt = { transactionHash: string; blockHash: string; blockNumber: string; status: string; transactionIndex: string };
const OPERATION_MS = 8000;
const GAS_LIMIT = 30000n;
const MAX_GAS_PRICE = 200_000_000_000n; // 200 gwei: at most 0.006 test MON per unique anchor
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type LedgerLimits = {
  maxTransactions?: number | (() => number);
  maxGasPriceWei?: bigint;
  operationMs?: number;
};

function integer(value: string): number {
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new ChainError("Monad returned invalid numeric evidence.");
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ChainError("Monad returned invalid numeric evidence.");
  return parsed;
}

function reference(block: Block | null): ChainReference {
  if (!block || !isHexString(block.hash, 32)) throw new ChainError("Monad did not return a verifiable block.");
  return { chainId: CHAIN_ID, blockNumber: integer(block.number), blockHash: block.hash, blockTimestamp: integer(block.timestamp) };
}

function configuredWallet(): Wallet {
  if (!process.env.ISSUER_PRIVATE_KEY) throw new ChainError("ISSUER_PRIVATE_KEY is not configured.");
  try { return new Wallet(process.env.ISSUER_PRIVATE_KEY); }
  catch { throw new ChainError("The issuer test wallet is not configured correctly."); }
}

/** Injectable transport permits offline tests without any production signing key. */
export function createMonadLedger(rpc: RpcCall, wallet: () => Wallet = configuredWallet, limits: LedgerLimits = {}) {
  const cache = new Map<string, LookupResult>();
  const anchors = new Map<string, Anchor>();
  let queue: Promise<unknown> = Promise.resolve();
  let pending: { hash: string; raw: string; digest: string; mayBeSubmitted: boolean } | null = null;
  let reservedTransactions = 0;
  const operationMs = limits.operationMs ?? OPERATION_MS;

  function transactionLimit(): number {
    const limit = typeof limits.maxTransactions === "function" ? limits.maxTransactions() : (limits.maxTransactions ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 0) throw new ChainError("The Monad test transaction limit must be a nonnegative integer.");
    return limit;
  }

  async function finalizedBlock(deadline = chainDeadline(operationMs)): Promise<ChainReference> {
    remaining(deadline);
    return reference(await rpc<Block | null>("eth_getBlockByNumber", ["finalized", false], deadline));
  }

  async function readLookup(txHash: string, deadline: number): Promise<LookupResult | null> {
    remaining(deadline);
    if (!isHexString(txHash, 32)) throw new ChainError("Invalid Monad transaction identifier.");
    const key = txHash.toLowerCase();
    const known = cache.get(key);
    if (known) return { ...known };
    const receipt = await rpc<TransactionReceipt | null>("eth_getTransactionReceipt", [txHash], deadline);
    if (!receipt) return null;
    const height = integer(receipt.blockNumber);
    const finalized = await finalizedBlock(deadline);
    if (height > finalized.blockNumber) return null;
    const tx = await rpc<Transaction | null>("eth_getTransactionByHash", [txHash], deadline);
    const block = reference(await rpc<Block | null>("eth_getBlockByNumber", [receipt.blockNumber, false], deadline));
    if (!tx || !tx.blockHash || tx.blockNumber === null ||
        tx.hash.toLowerCase() !== key || receipt.transactionHash.toLowerCase() !== key ||
        tx.blockHash.toLowerCase() !== block.blockHash.toLowerCase() ||
        receipt.blockHash.toLowerCase() !== block.blockHash.toLowerCase() ||
        integer(tx.blockNumber) !== height || block.blockNumber !== height ||
        (height === finalized.blockNumber && block.blockHash.toLowerCase() !== finalized.blockHash.toLowerCase())) {
      throw new ChainError("Monad returned inconsistent transaction evidence.");
    }
    const result: LookupResult = {
      ...block, from: tx.from, to: tx.to ?? "", data: tx.input, value: tx.value,
      status: integer(receipt.status), transactionIndex: integer(receipt.transactionIndex), finalized: true,
    };
    cache.set(key, result);
    return { ...result };
  }

  function makeAnchor(hash: string, evidence: LookupResult, digest: string): Anchor {
    const issuer = wallet().address.toLowerCase();
    if (evidence.status !== 1 || evidence.from.toLowerCase() !== issuer ||
        evidence.to.toLowerCase() !== issuer || BigInt(evidence.value) !== 0n ||
        evidence.data.toLowerCase() !== digest.toLowerCase()) {
      throw new ChainError("The finalized stamp does not match this permission.", hash);
    }
    return {
      txHash: hash, blockNumber: evidence.blockNumber,
      blockTimestamp: evidence.blockTimestamp, explorerUrl: `${EXPLORER_TX_URL}${hash}`,
    };
  }

  async function settle(deadline: number): Promise<Anchor> {
    const current = pending!;
    // Retain exact signed bytes and nonce until their outcome is reconciled.
    while (true) {
      let evidence: LookupResult | null;
      try {
        evidence = await readLookup(current.hash, deadline);
      } catch (error) {
        if (error instanceof ChainError) throw new ChainError(error.message, current.hash);
        throw new ChainError("The stamp could not be verified.", current.hash);
      }
      if (evidence) {
        // A finalized failed transaction consumes its nonce too.
        pending = null;
        const result = makeAnchor(current.hash, evidence, current.digest);
        anchors.set(current.digest, result);
        return { ...result };
      }
      try { await pause(Math.min(250, remaining(deadline))); }
      catch { throw new ChainError("The stamp is awaiting verification. Retry to reconcile the same transaction.", current.hash); }
    }
  }

  async function broadcast(deadline: number) {
    const current = pending!;
    try {
      const hash = await rpc<string>("eth_sendRawTransaction", [current.raw], deadline);
      if (hash.toLowerCase() !== current.hash.toLowerCase()) throw new Error("Unexpected transaction hash");
      current.mayBeSubmitted = true;
    } catch (error) {
      if (error instanceof RpcWriteError && error.outcome !== "uncertain" && !current.mayBeSubmitted) {
        // No prior attempt might have been accepted: safely release this reservation.
        pending = null;
        reservedTransactions--;
        throw error;
      }
      // An earlier attempt may have succeeded; later rejections cannot clear it.
      current.mayBeSubmitted = true;
      // Already-known / timed-out broadcast may have succeeded. Lookup is authoritative.
      remaining(deadline);
    }
  }

  function anchor(digest: string): Promise<Anchor> {
    if (!isHexString(digest, 32)) return Promise.reject(new ChainError("A stamp requires a 32-byte permission fingerprint."));
    const deadline = chainDeadline(operationMs); // includes queue wait and the enclosing HTTP operation
    const key = digest.toLowerCase();
    const job = queue.then(async () => {
      remaining(deadline);
      const known = anchors.get(key);
      if (known) return { ...known };
      if (pending) {
        // Re-broadcast only the exact same signed bytes, never silently reuse its nonce.
        await broadcast(deadline);
        await settle(deadline);
        const recovered = anchors.get(key);
        if (recovered) return { ...recovered };
      }
      const limit = transactionLimit();
      if (limit === 0) throw new ChainError("Real Monad transactions are paused until a test limit is approved.");
      if (reservedTransactions >= limit) throw new ChainError("The approved Monad test transaction limit has been reached.");
      const signer = wallet();
      const nonce = integer(await rpc<string>("eth_getTransactionCount", [signer.address, "latest"], deadline));
      const gasPrice = BigInt(await rpc<string>("eth_gasPrice", [], deadline));
      if (gasPrice <= 0n || gasPrice > (limits.maxGasPriceWei ?? MAX_GAS_PRICE)) {
        throw new ChainError("The Monad gas price exceeds the demo spending limit. No new stamp was sent.");
      }
      const raw = await signer.signTransaction({
        type: 0, chainId: CHAIN_ID, to: signer.address, value: 0n,
        data: key, gasLimit: GAS_LIMIT, gasPrice, nonce,
      });
      pending = { hash: keccak256(raw), raw, digest: key, mayBeSubmitted: false };
      reservedTransactions++;
      try {
        await broadcast(deadline);
        return await settle(deadline);
      } catch (error) {
        throw new ChainError(
          error instanceof ChainError ? error.message : "The stamp is awaiting verification.",
          error instanceof ChainError ? (error.txHash ?? pending?.hash) : pending?.hash,
        );
      }
    });
    queue = job.catch(() => undefined);
    return job;
  }

  return {
    anchor,
    lookup: (txHash: string) => readLookup(txHash, chainDeadline(operationMs)),
    latestReference: () => finalizedBlock(),
    latestTimestamp: async () => (await finalizedBlock()).blockTimestamp,
    // Public-safe metadata only; never expose the signed raw transaction.
    budgetStatus: () => ({ limit: transactionLimit(), reserved: reservedTransactions, pendingTxHash: pending?.hash ?? null }),
  };
}

const rpc = createRpcClient(() => [
  process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz",
  "https://rpc-testnet.monadinfra.com",
  "https://rpc.ankr.com/monad_testnet",
]);
const ledger = createMonadLedger(rpc, configuredWallet, {
  maxTransactions: () => Number(process.env.MONAD_MAX_TRANSACTIONS ?? "0"),
});
export const { anchor, lookup, latestReference, latestTimestamp, budgetStatus } = ledger;
