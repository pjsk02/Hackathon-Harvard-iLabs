import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Receipt, Slip } from "../../shared/contract";
import { attemptFingerprint } from "../../shared/attempt-record";
import EvidenceReview, { reviewContext } from "../src/split/EvidenceReview";
import { shortTransaction } from "../src/MonadRecord";
import { attemptReceipt, permission } from "./attempt-fixtures";
import { AGENT } from "../src/labels";

const render = (receipts: Receipt[], slips: Slip[] = [permission]) => renderToStaticMarkup(createElement(EvidenceReview, {
  receipts, slips, onRecheck: () => {},
}));
const requestCard = (html: string) => html.split('data-review-record="request"')[1].split("</article>")[0];

test("review separates exact verified permission/request links, with new-tab protections and short public identifiers", () => {
  const receipt = attemptReceipt();
  const html = render([receipt]);
  assert.match(html, /Permission record/); assert.match(html, /Request record/);
  assert.match(html, /BLOCKED/);
  assert.ok(html.includes(`href="${permission.anchor!.explorerUrl}"`));
  assert.ok(html.includes(`href="${receipt.attemptEvidence!.status === "recorded" ? receipt.attemptEvidence!.anchor.explorerUrl : ""}"`));
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.equal((html.match(/class="monad-record-link"/g) ?? []).length, 2);
  assert.ok(html.includes(shortTransaction(permission.anchor!.txHash)));
  assert.match(html, /Confirmed block/);
  assert.match(html, /<details.*Technical details/);
  assert.match(html, /not independent proof of AI reasoning/);
  assert.match(html, /recording happens afterward/);
  assert.doesNotMatch(html, /<iframe/);
});

test("unconfirmed states keep the decision and never acquire a request success link or substitute permission evidence", () => {
  for (const status of ["absent", "pending", "failed"] as const) {
    const html = render([attemptReceipt(status)]);
    const request = requestCard(html);
    assert.match(request, /BLOCKED/);
    assert.doesNotMatch(request, /monad-record-link|href=/);
    assert.equal(request.includes("Recheck record"), status === "pending");
  }
  const receipt = attemptReceipt();
  if (receipt.attemptEvidence!.status === "recorded") receipt.attemptEvidence!.anchor = { ...permission.anchor! };
  const request = requestCard(render([receipt]));
  assert.match(request, /Record could not be verified/);
  assert.doesNotMatch(request, /href=/);
  assert.match(request, /BLOCKED/);
});

test("review selects latest action, not a later dispute or stale blocked receipt, and binds its actual permission", () => {
  const earlier = attemptReceipt("absent");
  const latest = { ...earlier, id: "r_002", actionTime: earlier.actionTime + 2, decision: "ALLOWED" as const };
  const dispute = { ...earlier, id: "r_003", kind: "dispute" as const, actionTime: earlier.actionTime + 3, decision: "REJECTED" as const };
  assert.equal(reviewContext([permission], [earlier, dispute, latest]).receipt?.id, latest.id);
  const amended: Slip = { ...permission, label: "Amended", mandate: { ...permission.mandate, mandateId: "review-amended" } };
  const amendedRequest = { ...latest, mandateId: amended.mandate.mandateId };
  assert.equal(reviewContext([permission, amended], [amendedRequest]).permission?.label, "Amended");
  assert.equal(reviewContext([amended], [latest]).permission, null);
  assert.match(render([latest], [amended]), /A different permission cannot stand in for it/);
});

test("manual request source never claims an AI proposal, while agent copy uses current labels", () => {
  const receipt = attemptReceipt();
  receipt.source = "forced";
  receipt.attemptEvidence!.record.source = "forced";
  receipt.attemptEvidence!.fingerprint = attemptFingerprint(receipt.attemptEvidence!.record);
  assert.match(render([receipt]), /Manual request · not an AI proposal/);
  assert.ok(render([attemptReceipt()]).includes(`${AGENT} request`));
});

test("empty evidence is useful without fabricated outcomes, records, or explorer links", () => {
  const html = render([], []);
  assert.match(html, /Grant a permission first/);
  assert.match(html, /No request has been checked yet/);
  assert.doesNotMatch(html, /href=|Transaction ID|BLOCKED|ALLOWED/);
});
