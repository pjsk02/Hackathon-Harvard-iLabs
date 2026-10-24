// Read-only by default. --anchor explicitly spends test MON on one zero-value self-transaction.
import { latestReference, anchor, lookup } from "./ledger";
import { buildMandate, digestOf, issuerAddress, recoverSigner, signMandate } from "./slip";
import { stampMatchesRequest } from "./evidence";
import { ChainError } from "./rpc";

async function run() {
  const start = Date.now();
  const ref = await latestReference();
  console.log("Monad finalized block:", ref);
  if (!process.argv.includes("--anchor")) {
    console.log("Read-only check passed. Add --anchor only with a funded test issuer configured.");
    return;
  }
  const mandate = buildMandate({ scenarioId: "consulting", allowedActions: ["read_regional_margins"], issuedAt: ref.blockTimestamp });
  const signed = await signMandate(mandate);
  if (recoverSigner(mandate, signed.signature) !== issuerAddress() || signed.digest !== digestOf(mandate)) {
    throw new Error("Signature verification failed.");
  }
  const stamp = await anchor(signed.digest);
  const evidence = await lookup(stamp.txHash);
  const request = await latestReference();
  if (!stampMatchesRequest({ mandate, ...signed, anchor: stamp, label: "Original" }, evidence, request)) {
    throw new Error("Stamp verification failed.");
  }
  console.log("Real signature, finalized stamp and readback passed:", { ...stamp, elapsedMs: Date.now() - start });
}

run().catch((error) => {
  console.error(error instanceof ChainError ? error.message : "The signing/chain smoke check failed. Check issuer configuration and funding.");
  process.exitCode = 1;
});
