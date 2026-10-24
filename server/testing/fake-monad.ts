// Offline transport only. No RPC URLs, environment credentials or live providers.
import { Transaction, Wallet, id, keccak256 } from "ethers";
import { RpcWriteError, type RpcCall } from "../chain/rpc";

export const fakeWallet = () => new Wallet(Wallet.createRandom().privateKey);
export const blockHash = (height: number) => id(`offline-block-${height}`);
const hex = (n: number) => `0x${n.toString(16)}`;

export function fakeMonad(options: { unfinalized?: boolean; status?: number; lost?: boolean; rejected?: boolean; onGas?: () => void } = {}) {
  let height = 100;
  let broadcasts = 0;
  const records = new Map<string, { tx: Transaction; height: number }>();
  const rpc: RpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
    let value: unknown;
    if (method === "eth_getBlockByNumber") {
      const n = params[0] === "finalized" ? height - (options.unfinalized ? 1 : 0) : Number(BigInt(params[0] as string));
      value = { number: hex(n), hash: blockHash(n), timestamp: hex(1_792_850_000) };
    } else if (method === "eth_getTransactionCount") value = hex(records.size);
    else if (method === "eth_gasPrice") { options.onGas?.(); value = "0x3b9aca00"; }
    else if (method === "eth_sendRawTransaction") {
      broadcasts++;
      if (options.rejected) throw new RpcWriteError("Offline definite rejection", "rejected");
      const raw = params[0] as string;
      const hash = keccak256(raw);
      if (!records.has(hash)) records.set(hash, { tx: Transaction.from(raw), height: ++height });
      if (options.lost) throw new RpcWriteError("Offline missing response", "uncertain");
      value = hash;
    } else if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") {
      const hash = params[0] as string;
      const row = records.get(hash);
      value = !row ? null : method === "eth_getTransactionReceipt"
        ? { transactionHash: hash, blockNumber: hex(row.height), blockHash: blockHash(row.height), status: hex(options.status ?? 1), transactionIndex: "0x0" }
        : { hash, from: row.tx.from, to: row.tx.to, input: row.tx.data, value: "0x0", blockNumber: hex(row.height), blockHash: blockHash(row.height) };
    } else throw new Error(`Unexpected offline RPC method: ${method}`);
    return value as T;
  };
  return { rpc, records, options, broadcasts: () => broadcasts };
}
