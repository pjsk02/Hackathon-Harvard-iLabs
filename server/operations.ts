import { createHash } from "node:crypto";
import { UUID_PATTERN } from "../shared/attempt-record";
import { httpError } from "./http";
import * as state from "./state";

/** Private request deduplication. These hashes/inputs never enter a chain record. */
export function createOperationCache(fence = state.assertCurrentGeneration, generation = state.getGeneration) {
  const entries = new Map<string, { generation: number; signature: string; promise: Promise<unknown> }>();
  return async function once<T>(key: unknown, kind: string, input: unknown, work: () => Promise<T>): Promise<T> {
    if (typeof key !== "string" || !UUID_PATTERN.test(key)) {
      throw httpError(400, "A UUID Idempotency-Key header is required. Reuse it only when retrying the same request.");
    }
    key = key.toLowerCase();
    const started = generation();
    fence(started);
    const signature = createHash("sha256").update(JSON.stringify([kind, input])).digest("hex");
    let entry = entries.get(key as string);
    if (entry) {
      if (entry.generation !== started) throw httpError(409, "This request belongs to a previous session. It was not repeated.");
      if (entry.signature !== signature) throw httpError(409, "This request identifier was already used for different input.");
    } else {
      if (entries.size >= 500) throw httpError(503, "This demo process has reached its request limit.");
      const promise = Promise.resolve().then(() => { fence(started); return work(); }).then((value) => structuredClone(value));
      entry = { generation: started, signature, promise };
      entries.set(key as string, entry);
    }
    const result = await entry.promise as T;
    fence(started);
    return structuredClone(result);
  };
}

export const once = createOperationCache();
