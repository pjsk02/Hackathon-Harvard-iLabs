import { CHAIN_ID } from "../../shared/contract";

export type RpcCall = <T>(method: string, params: unknown[], deadline: number) => Promise<T>;

export class ChainError extends Error {
  constructor(message: string, public readonly txHash?: string) {
    super(message);
    this.name = "ChainError";
  }
}

/** Safe metadata for sender recovery. Never includes provider bodies or signed bytes. */
export class RpcWriteError extends ChainError {
  constructor(message: string, public readonly outcome: "not-submitted" | "rejected" | "uncertain") {
    super(message);
    this.name = "RpcWriteError";
  }
}

function definiteRejection(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  if (/insufficient funds/i.test(message)) return "The test wallet has insufficient test MON for this stamp.";
  if (/intrinsic gas too low|exceeds block gas limit|invalid sender|invalid chain id|transaction type not supported/i.test(message)) {
    return "Monad rejected the transaction before accepting it.";
  }
  // "Nonce too low", "already known", generic errors and proxy failures can mean
  // the transaction was already submitted elsewhere. Never call them definite.
  return null;
}

export function remaining(deadline: number): number {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new ChainError("Monad verification timed out. No data was released.");
  return ms;
}

/** Lazy HTTP JSON-RPC. Never probe the network at import or application boot. */
export function createRpcClient(urls: () => string[]): RpcCall {
  return async <T>(method: string, params: unknown[], deadline: number): Promise<T> => {
    const endpoints = [...new Set(urls())];
    const isWrite = method === "eth_sendRawTransaction";
    let uncertainWrite = false;
    for (let index = 0; index < endpoints.length; index++) {
      let budget: number;
      try { budget = remaining(deadline); }
      catch (error) {
        if (isWrite) throw new RpcWriteError("The stamp submission timed out.", uncertainWrite ? "uncertain" : "not-submitted");
        throw error;
      }
      const timeout = Math.max(1, Math.floor(budget / (endpoints.length - index)));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let writeAttempted = false;
      const send = async (rpcMethod: string, rpcParams: unknown[]) => {
        if (rpcMethod === "eth_sendRawTransaction") writeAttempted = true;
        const response = await fetch(endpoints[index], {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpcMethod, params: rpcParams }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("RPC HTTP failure");
        const body = await response.json() as { id?: number; error?: unknown; result?: unknown };
        if (body.id !== 1) throw new Error("Invalid RPC response");
        if (body.error) {
          const rejection = rpcMethod === "eth_sendRawTransaction" ? definiteRejection(body.error) : null;
          if (rejection) throw new RpcWriteError(rejection, "rejected");
          throw new Error("RPC operation failed");
        }
        if (!Object.hasOwn(body, "result")) throw new Error("Invalid RPC response");
        return body.result;
      };
      try {
        // Validate every endpoint used, even when failing over. Never trust a configured URL's chain.
        const chain = await send("eth_chainId", []);
        if (chain !== `0x${CHAIN_ID.toString(16)}`) throw new ChainError("The RPC is not connected to Monad testnet.");
        return await send(method, params) as T;
      } catch (error) {
        if (isWrite && writeAttempted) {
          if (error instanceof RpcWriteError && error.outcome === "rejected") {
            // A preceding timeout on another endpoint is not disproved by this rejection.
            if (!uncertainWrite) throw error;
          } else {
            uncertainWrite = true;
          }
        }
        if (index === endpoints.length - 1) {
          if (isWrite) {
            throw new RpcWriteError(
              uncertainWrite ? "The stamp may have been submitted. Its outcome must be checked." : "No stamp was submitted; Monad is unavailable.",
              uncertainWrite ? "uncertain" : "not-submitted",
            );
          }
          if (error instanceof ChainError) throw error;
          // Provider bodies/URLs can contain credentials; do not propagate them.
          throw new ChainError("Monad could not verify this operation. Please retry.");
        }
      } finally {
        clearTimeout(timer);
      }
    }
    if (isWrite) throw new RpcWriteError("No Monad RPC is configured.", "not-submitted");
    throw new ChainError("No Monad RPC is configured.");
  };
}
