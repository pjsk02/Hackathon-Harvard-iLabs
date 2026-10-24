import assert from "node:assert/strict";
import { test } from "node:test";
import { isHealth } from "../src/api-contract";
import { canRecord, canSelftest, healthStatus, isReadiness, readinessLines } from "../src/health-status";
import { verifiedHealth } from "./health-fixtures";

test("real-shaped verified readiness reports local signing and a finalized Monad testnet block", () => {
  const health = verifiedHealth();
  assert.equal(isHealth(health), true);
  const status = healthStatus(health);
  assert.equal(status.state, "verified");
  assert.match(status.message, /Signing verified by a local signature check/);
  assert.match(status.message, /Monad testnet connected · finalized block 28,749,163/);
  assert.match(status.message, /AI configured; no live model test performed/);
  assert.doesNotMatch(status.message, /not yet verified|rpc\.fixture|Local signature recovered/);
  assert.equal(canRecord(status), true);
});

test("legacy health remains explicitly unverified, and configuration alone never proves connectivity", () => {
  const health = verifiedHealth(); delete health.readiness;
  assert.equal(isHealth(health), true);
  assert.equal(healthStatus(health).state, "unverified");
  assert.match(healthStatus(health).message, /not yet verified/);
  assert.equal(canSelftest(health), false);
  health.ok = false;
  assert.equal(healthStatus(health).state, "unavailable");
  assert.equal(healthStatus(null).state, "unavailable");
  assert.equal(healthStatus(verifiedHealth(), { checking: true }).state, "checking");
});

test("malformed optional readiness is rejected instead of silently treated as legacy", () => {
  const mutations: ((health: any) => void)[] = [
    (h) => { h.readiness = null; }, (h) => { h.readiness = undefined; },
    (h) => { h.readiness.checkedAt = "yesterday"; },
    (h) => { h.readiness.checkedAt = "2026-02-30T12:00:00Z"; },
    (h) => { h.readiness.checkedAt = 1792800000; },
    (h) => { delete h.readiness.signing; },
    (h) => { h.readiness.signing.status = "configured"; },
    (h) => { h.readiness.signing.status = ["verified"]; },
    (h) => { h.readiness.signing.detail = {}; },
    (h) => { h.readiness.monad.status = "verified"; },
    (h) => { h.readiness.monad.status = ["connected"]; h.readiness.monad.chainId = 1; },
    (h) => { h.readiness.monad.chainId = 1; },
    (h) => { h.readiness.monad.chainId = null; },
    (h) => { h.readiness.monad.blockNumber = null; },
    (h) => { h.readiness.monad.blockNumber = 0; },
    (h) => { h.readiness.monad.blockNumber = 123.5; },
    (h) => { h.readiness.monad.blockNumber = Number.MAX_SAFE_INTEGER + 1; },
    (h) => { h.readiness.ai.status = "live-tested"; },
    (h) => { h.readiness.ai.status = ["configured"]; },
    (h) => { h.readiness.ai.detail = null; },
    (h) => { h.readiness.recording.paused = "false"; },
    (h) => { h.readiness.recording.remaining = -1; },
    (h) => { h.readiness.recording.remaining = 3.5; },
    (h) => { h.readiness.recording.remaining = Infinity; },
    (h) => { h.readiness.extra = "untrusted"; },
  ];
  for (const mutate of mutations) {
    const health = verifiedHealth(); mutate(health);
    assert.equal(isHealth(health), false, mutate.toString());
  }
});

test("partial checks distinguish signing failure from a functioning Monad connection", () => {
  const health = verifiedHealth();
  health.readiness!.signing.status = "unavailable";
  assert.equal(isHealth(health), true);
  const status = healthStatus(health);
  assert.equal(status.state, "unavailable");
  assert.match(status.message, /Signing unavailable/);
  assert.match(status.message, /Monad testnet connected/);
  assert.equal(canRecord(status), false);
  health.readiness!.signing.status = "verified";
  health.readiness!.monad = { status: "unavailable", chainId: null, blockNumber: null, detail: "Unavailable." };
  assert.equal(isHealth(health), true);
  assert.match(healthStatus(health).message, /Signing verified/);
  assert.match(healthStatus(health).message, /Monad connection unavailable/);
});

test("paused or exhausted live recording does not turn verified connections into failures", () => {
  const health = verifiedHealth();
  health.readiness!.recording.paused = true;
  assert.equal(healthStatus(health).state, "verified");
  assert.match(healthStatus(health).message, /Live recording paused/);
  assert.equal(canRecord(healthStatus(health)), false);
  assert.equal(canSelftest(health), false);
  health.readiness!.recording.paused = false;
  health.readiness!.recording.remaining = 0;
  assert.equal(healthStatus(health).state, "verified");
  assert.match(healthStatus(health).message, /allowance exhausted.*not a connection failure/);
  assert.equal(canRecord(healthStatus(health)), false);
});

test("practice and unreadable demo state never enable writes, even with a successful signing check", () => {
  const health = verifiedHealth();
  health.mockChain = true;
  health.readiness!.monad = { status: "practice", chainId: null, blockNumber: null, detail: "Practice only." };
  assert.equal(isReadiness(health.readiness), true);
  assert.equal(healthStatus(health).state, "unavailable");
  assert.equal(canRecord(healthStatus(health)), false);
  assert.match(healthStatus(health).message, /Practice-chain mode/);
  const status = healthStatus(verifiedHealth(), { stateReadable: false });
  assert.equal(status.state, "unavailable");
  assert.match(status.message, /Signing verified.*Monad testnet connected.*demo record could not be read/);
  assert.equal(canRecord(status), false);
});

test("AI configuration is never represented as a successful live model test", () => {
  const health = verifiedHealth();
  health.readiness!.ai.status = "missing";
  const status = healthStatus(health);
  assert.equal(status.state, "verified");
  assert.match(status.message, /AI key missing; no live model test performed/);
  assert.equal(readinessLines(verifiedHealth().readiness!).ai, "AI configured; no live model test performed.");
});

test("manual self-test requires verified checks, unpaused recording, and at least four transactions", () => {
  const health = verifiedHealth();
  assert.equal(canSelftest(health), true);
  health.readiness!.recording.remaining = 3;
  assert.equal(canSelftest(health), false);
  health.readiness!.recording.remaining = 4;
  assert.equal(canSelftest(health), true);
  health.readiness!.recording.paused = true;
  assert.equal(canSelftest(health), false);
  assert.equal(canSelftest(null), false);
});
