// Shared contract (ENVOI_BUILD_SPEC.md section 7). Frozen at 9:50.
// Changing any shape here needs all three people to agree.

export type Mandate = {
  mandateId: string;
  issuer: string;
  agentId: string;
  resource: string;
  scenarioId: string;
  allowedActions: string[];
  issuedAt: number; // unix SECONDS
  expiresAt: number; // unix SECONDS
  nonce: string; // 8 hex chars
};

export type Anchor = {
  txHash: string;
  blockNumber: number;
  blockTimestamp: number; // unix SECONDS, from the block
  explorerUrl: string;
};

export type Slip = {
  mandate: Mandate;
  signature: string;
  digest: string;
  label: "Original" | "Amended";
  anchor: Anchor | null;
};

export type CheckId = "signed" | "agent" | "valid" | "stamped" | "scope";
export type Check = { id: CheckId; label: string; pass: boolean; detail: string };

export type Decision = "ALLOWED" | "BLOCKED" | "REJECTED";

// Additive attempt evidence approved for the integrated P1/P2/P3 work.
export type AttemptRecord = {
  version: 1;
  attemptId: string;
  receiptId: string;
  chainId: 10143;
  permissionFingerprint: string;
  requestBlock: { blockNumber: number; blockHash: string; blockTimestamp: number };
  agent: "atlas-research-agent" | "other";
  action: "read_regional_margins" | "read_employee_salaries" | "other";
  source: "agent" | "forced";
  decision: "ALLOWED" | "BLOCKED";
  checks: { id: CheckId; pass: boolean }[];
};

export type AttemptEvidence = {
  record: AttemptRecord;
  fingerprint: string;
} & (
  | { status: "pending"; anchor: null; txHash: string | null; detail: string }
  | { status: "recorded"; anchor: Anchor; txHash: string }
  | { status: "failed"; anchor: null; txHash: string | null; detail: string }
);

export type Receipt = {
  id: string;
  kind: "action" | "dispute";
  createdAt: string; // ISO
  actionTime: number; // unix SECONDS, chain time
  agentId: string;
  mandateId: string;
  action: string;
  source: "agent" | "forced";
  decision: Decision;
  checks: Check[]; // always all five, order: signed, agent, valid, stamped, scope
  data: unknown | null;
  explorerUrl: string | null;
  attemptEvidence?: AttemptEvidence;
};

export type ActionDef = { name: string; label: string };

export type Scenario = {
  id: string;
  title: string;
  client: { name: string; person: string };
  firm: { name: string };
  agent: { id: string; name: string; role: string };
  allowed: ActionDef;
  forbidden: ActionDef;
  validUntilLabel: string;
  task: string;
  reports: { clean: string; poisoned: string };
};

export type ReportId = "clean" | "poisoned";

// Request / response bodies
export type CreateSlipRequest = { scenarioId: string };
export type ActRequest = { agentId: string; mandateId: string; action: string };
/** An uploaded report. Additive and optional (agreed by the team for the upload scene):
 *  when present, the agent reads `text` instead of the built-in report. `text` is everything
 *  in the file, including text people can't see. */
export type UploadedReport = { fileName: string; text: string };
export type AgentRunRequest = { reportId: ReportId; upload?: UploadedReport };
export type AgentRunResponse = { transcript: string; proposedCalls: string[]; receipts: Receipt[] };
export type AgentEvalResponse = { n: number; salariesProposed: number; rate: number };
export type SelftestStep = { scene: string; expected: string; got: string; ms: number };
export type SelftestResponse = { pass: boolean; steps: SelftestStep[] };
export type StateResponse = { scenario: Scenario; slips: Slip[]; receipts: Receipt[]; counter: number };
export type ResetResponse = { ok: true };
export type HealthResponse = { ok: boolean; mockChain: boolean; issuer: string | null; rpc: string };
export type ErrorResponse = { error: string };

// Constants
export const AGENT_ID = "atlas-research-agent";
export const MANDATE_ID = "northwind-atlas-001";
export const AMENDED_MANDATE_ID = "northwind-atlas-001-amended";
export const RESOURCE = "northwind-data-api";
export const CHAIN_ID = 10143;
export const EXPLORER_TX_URL = "https://testnet.monadvision.com/tx/";
