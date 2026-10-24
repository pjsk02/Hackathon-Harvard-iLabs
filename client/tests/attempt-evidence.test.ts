import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EXPLORER_TX_URL, type Receipt } from "../../shared/contract";
import { attemptFingerprint } from "../../shared/attempt-record";
import { attemptEvidence, evidenceCounts } from "../src/attempt-evidence";
import AttemptEvidence from "../src/AttemptEvidence";
import { attemptReceipt, permission } from "./attempt-fixtures";

const render = (receipt: Receipt, busy = false) => renderToStaticMarkup(createElement(AttemptEvidence, {
  receipt, slips: [permission], busy, onRecheck: () => {},
}));

test("all evidence states keep application decisions independent and only recorded attempts link", () => {
  for (const status of ["absent", "pending", "recorded", "failed"] as const) {
    const receipt = attemptReceipt(status);
    assert.equal(attemptEvidence(receipt, [permission]).status, status);
    const html = render(receipt);
    assert.equal(html.includes("<a "), status === "recorded");
    assert.equal(html.includes("<button "), status === "pending");
    assert.equal(receipt.decision, "BLOCKED");
    assert.ok(!html.includes("Private upstream"));
    assert.ok(!html.includes(permission.anchor!.explorerUrl));
  }
  assert.match(render(attemptReceipt("pending"), true), /disabled=""/);
  assert.match(render(attemptReceipt("pending")), /Recheck record/);
  assert.match(render(attemptReceipt("recorded")), /block 125/);
});

test("forged records, receipt mismatches, unsafe fields, and misleading explorer links fail closed", () => {
  const mutations: ((receipt: any) => void)[] = [
    (r) => { r.attemptEvidence.fingerprint = `0x${"00".repeat(32)}`; },
    (r) => { r.attemptEvidence.record.payload = "PRIVATE_REPORT_CONTENT"; },
    (r) => { r.attemptEvidence.record.requestBlock.extra = "PRIVATE_REPORT_CONTENT"; },
    (r) => { r.attemptEvidence.record.checks[0].detail = "PRIVATE_REPORT_CONTENT"; },
    (r) => { r.id = "r_002"; },
    (r) => { r.action = "read_regional_margins"; },
    (r) => { r.source = "forced"; },
    (r) => { r.agentId = "another-agent"; },
    (r) => { r.decision = "ALLOWED"; },
    (r) => { r.checks[4].pass = true; },
    (r) => { r.actionTime++; },
    (r) => { r.mandateId = "missing"; },
    (r) => { r.kind = "dispute"; },
    (r) => { r.attemptEvidence.status = "invented"; },
    (r) => { r.attemptEvidence.anchor = null; },
    (r) => { r.attemptEvidence.anchor.blockNumber = 124; },
    (r) => { r.attemptEvidence.anchor.blockNumber = 125.5; },
    (r) => { r.attemptEvidence.anchor.blockTimestamp = 0; },
    (r) => { r.attemptEvidence.anchor.blockTimestamp = r.actionTime - 1; },
    (r) => { r.attemptEvidence.anchor.txHash = `0x${"de".repeat(32)}`; },
    (r) => { r.attemptEvidence.anchor.explorerUrl = permission.anchor!.explorerUrl; },
    (r) => { r.explorerUrl = r.attemptEvidence.anchor.explorerUrl.toUpperCase().replace("/TX/", "/tx/"); },
    (r) => { r.attemptEvidence.anchor.explorerUrl += "?redirect=private"; },
    (r) => { r.attemptEvidence.anchor.explorerUrl += "#private"; },
    (r) => { r.attemptEvidence.anchor.explorerUrl = r.attemptEvidence.anchor.explorerUrl.replace("https:", "http:"); },
    (r) => { r.attemptEvidence.anchor.explorerUrl = r.attemptEvidence.anchor.explorerUrl.replace("monadvision.com", "monadvision.com.evil.invalid"); },
    (r) => { r.attemptEvidence.txHash = permission.anchor!.txHash;
      r.attemptEvidence.anchor = { ...permission.anchor, blockNumber: 125, blockTimestamp: r.actionTime + 1 }; },
    (r) => { r.attemptEvidence.record.permissionFingerprint = `0x${"de".repeat(32)}`;
      r.attemptEvidence.fingerprint = attemptFingerprint(r.attemptEvidence.record); },
    (r) => { r.attemptEvidence.record.checks[4].pass = true;
      r.attemptEvidence.fingerprint = attemptFingerprint(r.attemptEvidence.record); },
  ];
  for (const mutate of mutations) {
    const receipt = attemptReceipt();
    mutate(receipt);
    assert.equal(attemptEvidence(receipt, [permission]).status, "invalid", mutate.toString());
    const html = render(receipt);
    assert.match(html, /Record could not be verified/);
    assert.ok(!html.includes("<a ") && !html.includes("PRIVATE_REPORT_CONTENT") && !html.includes("<button "));
  }
});

test("pending and failed attempts never expose a submitted public record link", () => {
  for (const status of ["pending", "failed"] as const) {
    const receipt = attemptReceipt(status);
    receipt.attemptEvidence!.txHash = `0x${"bc".repeat(32)}`;
    assert.equal(attemptEvidence(receipt, [permission]).status, status);
    assert.ok(!render(receipt).includes(EXPLORER_TX_URL));
  }
});

test("confirmed attempt counts exclude absent, pending, failed, and invalid evidence", () => {
  const invalid = attemptReceipt(); invalid.attemptEvidence!.fingerprint = "invalid";
  assert.equal(evidenceCounts([permission], [attemptReceipt(), attemptReceipt("pending"), attemptReceipt("failed"), attemptReceipt("absent"), invalid]), 1);
  assert.equal(evidenceCounts([], [attemptReceipt()]), 0);
  assert.equal(permission.anchor!.blockNumber, 123);
});
