import { Transaction, keccak256 } from "ethers";
import type { RpcCall } from "../chain/rpc";
import { activeExternal, pool, spend, transaction } from "./repository";
import { httpError } from "../http";

/** Write-ahead journal: no bytes leave the process until both quota and identity are durable.
 * Signed bytes are deliberately NOT retained: recovery only reads, never rebroadcasts.
 */
export function journaledRpc(rpc: RpcCall, store = { transaction, spend }): RpcCall {
  return async <T>(method: string, params: unknown[], deadline: number): Promise<T> => {
    if (method !== "eth_sendRawTransaction") return rpc<T>(method, params, deadline);
    const context = activeExternal.getStore();
    if (!context) throw httpError(503, "Live writes require a durable workspace operation.");
    await context.checkpoint();
    const raw = params[0];
    if (typeof raw !== "string") throw new Error("Invalid transaction");
    const tx = Transaction.from(raw);
    const hash = keccak256(raw);
    await store.transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock(9172403)");
      const existing = await c.query("SELECT 1 FROM envoi_broadcasts WHERE tx_hash=$1 OR (issuer=$2 AND status='unknown')", [hash,tx.from!.toLowerCase()]);
      if (existing.rowCount) throw httpError(409, "An issuer transaction is unconfirmed or already submitted. Only read-only reconciliation is permitted.");
      await store.spend(c, "chain");
      await c.query("INSERT INTO envoi_broadcasts(tx_hash,operation_id,issuer,nonce,fingerprint) VALUES($1,$2,$3,$4,$5)",
        [hash,context.op.id,tx.from!.toLowerCase(),tx.nonce,tx.data.toLowerCase()]);
    });
    // Failure here remains unknown, even when the provider claims rejection.
    return rpc<T>(method, params, deadline);
  };
}
export async function settleJournal(hash: string, status: "recorded" | "failed") {
  await pool.query("UPDATE envoi_broadcasts SET status=$2 WHERE tx_hash=$1", [hash,status]);
}
