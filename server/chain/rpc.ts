import { CHAIN_ID } from "../../shared/contract";

export type RpcCall = <T>(method: string, params: unknown[], deadline: number) => Promise<T>;

export class ChainError extends Error {
  constructor(message: string, public readonly txHash?: string) {
    super(message);
    this.name = "ChainError";
  }
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
    for (let index = 0; index < endpoints.length; index++) {
      const budget = remaining(deadline);
      const timeout = Math.max(1, Math.floor(budget / (endpoints.length - index)));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const send = async (rpcMethod: string, rpcParams: unknown[]) => {
        const response = await fetch(endpoints[index], {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpcMethod, params: rpcParams }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("RPC HTTP failure");
        const body = await response.json() as { id?: number; error?: unknown; result?: unknown };
        if (body.id !== 1 || body.error || !Object.hasOwn(body, "result")) throw new Error("Invalid RPC response");
        return body.result;
      };
      try {
        // Validate every endpoint used, even when failing over. Never trust a configured URL's chain.
        const chain = await send("eth_chainId", []);
        if (chain !== `0x${CHAIN_ID.toString(16)}`) throw new ChainError("The RPC is not connected to Monad testnet.");
        return await send(method, params) as T;
      } catch (error) {
        if (index === endpoints.length - 1) {
          if (error instanceof ChainError) throw error;
          // Provider bodies/URLs can contain credentials; do not propagate them.
          throw new ChainError("Monad could not verify this operation. Please retry.");
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ChainError("No Monad RPC is configured.");
  };
}
