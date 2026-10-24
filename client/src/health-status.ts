import type { HealthResponse, Readiness } from "@shared/contract";
import { CHAIN_ID } from "@shared/contract";

export type ConnectionStatus = {
  state: "checking" | "unverified" | "unavailable" | "verified";
  message: string;
  recording?: Readiness["recording"];
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const detail = (value: unknown) => typeof value === "string";

/** Optional means absent, not malformed. Configuration is not a successful connection check. */
export function isReadiness(value: unknown): value is Readiness {
  if (!object(value) || !keys(value, ["checkedAt", "signing", "monad", "ai", "recording"])
    || typeof value.checkedAt !== "string"
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value.checkedAt)
    || !Number.isFinite(Date.parse(value.checkedAt))
    || new Date(value.checkedAt).toISOString().slice(0, 10) !== value.checkedAt.slice(0, 10)) return false;
  const { signing, monad, ai, recording } = value;
  return object(signing) && keys(signing, ["status", "detail"])
    && typeof signing.status === "string" && ["verified", "unavailable"].includes(signing.status) && detail(signing.detail)
    && object(monad) && keys(monad, ["status", "chainId", "blockNumber", "detail"])
    && typeof monad.status === "string" && ["connected", "unavailable", "practice"].includes(monad.status) && detail(monad.detail)
    && (monad.chainId === null || positive(monad.chainId))
    && (monad.blockNumber === null || positive(monad.blockNumber))
    && (monad.status !== "connected" || (monad.chainId === CHAIN_ID && positive(monad.blockNumber)))
    && object(ai) && keys(ai, ["status", "detail"])
    && typeof ai.status === "string" && ["configured", "missing"].includes(ai.status) && detail(ai.detail)
    && object(recording) && keys(recording, ["paused", "remaining", "detail"])
    && typeof recording.paused === "boolean" && detail(recording.detail)
    && typeof recording.remaining === "number" && Number.isSafeInteger(recording.remaining) && recording.remaining >= 0;
}

/** Fixed, public-facing copy. Do not expose RPC endpoints, diagnostic payloads, or imply a model call. */
export function readinessLines(readiness: Readiness) {
  return {
    signing: readiness.signing.status === "verified"
      ? "Signing verified by a local signature check."
      : "Signing unavailable; the local signature check did not pass.",
    monad: readiness.monad.status === "connected"
      ? `Monad testnet connected · finalized block ${readiness.monad.blockNumber!.toLocaleString("en-US")}.`
      : readiness.monad.status === "practice"
        ? "Practice-chain mode; no live Monad connection verified."
        : "Monad connection unavailable; no finalized testnet block verified.",
    ai: readiness.ai.status === "configured"
      ? "AI configured; no live model test performed."
      : "AI key missing; no live model test performed.",
    recording: readiness.recording.paused
      ? `Live recording paused · ${readiness.recording.remaining} transactions remaining. Connection checks do not submit transactions.`
      : readiness.recording.remaining === 0
        ? "Live recording allowance exhausted · 0 transactions remaining. This is not a connection failure."
        : `Live recording allowance: ${readiness.recording.remaining} transactions remaining.`,
  };
}

export function healthStatus(health: HealthResponse | null, {
  checking = false, stateReadable = true,
}: { checking?: boolean; stateReadable?: boolean } = {}): ConnectionStatus {
  if (checking) return { state: "checking", message: "Checking local signing and finalized Monad status…" };
  if (!health) return { state: "unavailable", message: "Server status could not be read. Check status before submitting." };
  if (health.readiness !== undefined) {
    if (!isReadiness(health.readiness)) return { state: "unavailable", message: "The server returned incomplete readiness checks. Check status again." };
    const lines = readinessLines(health.readiness);
    const verified = !health.mockChain && health.readiness.signing.status === "verified" && health.readiness.monad.status === "connected";
    const message = [lines.signing, health.mockChain ? "Practice-chain mode; live demo blocked." : lines.monad,
      lines.recording, lines.ai, ...(!stateReadable ? ["The demo record could not be read; submissions are disabled."] : [])].join(" ");
    return { state: verified && stateReadable ? "verified" : "unavailable", message, recording: health.readiness.recording };
  }
  return {
    state: health.ok && !health.mockChain && stateReadable ? "unverified" : "unavailable",
    message: health.mockChain ? "Practice-chain mode is enabled; the live demo is blocked."
      : !stateReadable ? "The demo record could not be read. Check status before submitting."
        : !health.ok ? "The server reported a failed health check."
          : "Server responded; signing and the Monad connection are not yet verified. AI configuration and live testing are unknown.",
  };
}

export function canRecord(connection: ConnectionStatus): boolean {
  return (connection.state === "verified" || connection.state === "unverified")
    && (!connection.recording || (!connection.recording.paused && connection.recording.remaining > 0));
}

export function canSelftest(health: HealthResponse | null): boolean {
  const connection = healthStatus(health);
  return connection.state === "verified" && canRecord(connection) && (connection.recording?.remaining ?? 0) >= 4;
}
