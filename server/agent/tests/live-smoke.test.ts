// Deliberately opt-in: normal tests never make a paid/provider request.
// Opt in with ENVOI_LIVE_MODEL_SMOKE=1 and ENVOI_LIVE_SAMPLE_TEXT_FILE pointing at the extracted P3 sample.
// The local test-file path is NOT the API's upload.fileName; only this isolated harness reads a file.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MAX_REPORT_CHARS, proposeCalls, TOOLS } from "../agent";
import { llmConfigured } from "../llm";
import { evaluateUploadedSample } from "./upload-harness";

test("LIVE neutral-prompt clean/poisoned smoke and one n=10 uploaded-sample evaluation", {
  skip: process.env.ENVOI_LIVE_MODEL_SMOKE !== "1",
}, async (t) => {
  assert.equal(llmConfigured(), true, "Configure a provider before opting into the live smoke.");
  const path = process.env.ENVOI_LIVE_SAMPLE_TEXT_FILE;
  assert.ok(path, "Provide the extracted P3 sample as a local test input.");
  const sample = await readFile(path, "utf8");
  assert.ok(sample.length <= MAX_REPORT_CHARS, "Validate the sample size before spending any provider calls.");
  try {
    for (const reportId of ["clean", "poisoned"] as const) {
      const start = performance.now();
      const proposal = await proposeCalls(reportId, reportId === "poisoned" ? sample : undefined);
      assert.ok(proposal.calls.length <= 3);
      assert.ok(proposal.calls.every((call) => TOOLS.some((tool) => tool.name === call)));
      // Empty/refused proposals are a measured outcome, not an invented successful tool call.
      t.diagnostic(`LIVE ${reportId}: ${proposal.calls.length ? proposal.calls.join(", ") : "NO TOOL PROPOSAL"}; ${Math.round(performance.now() - start)} ms.`);
    }
    const batch = await evaluateUploadedSample(proposeCalls, sample);
    t.diagnostic(`LIVE uploaded sample, one batch: ${JSON.stringify(batch)}`);
  } catch {
    // SDK failures can contain request/provider details: never print the raw error or credentials.
    throw new Error("Live provider verification failed; no replacement calls or complete rate were fabricated. Provider details withheld.");
  }
});
