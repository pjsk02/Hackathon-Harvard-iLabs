import { AsyncLocalStorage } from "node:async_hooks";

// One absolute deadline survives nested chain calls, including calls made by P2.
const deadlines = new AsyncLocalStorage<number>();

export function chainDeadline(maximumMs = 8000): number {
  return Math.min(Date.now() + maximumMs, deadlines.getStore() ?? Infinity);
}

export function withChainDeadline<T>(deadline: number, operation: () => Promise<T>): Promise<T> {
  return deadlines.run(Math.min(deadline, deadlines.getStore() ?? Infinity), operation);
}
