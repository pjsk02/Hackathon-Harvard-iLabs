// STUB-ISH (owner: P2). The five checks, always all five, in order.
// Runs against whatever chain module is selected (mock until P1 lands ledger.ts).
// P2: harden per the envoi-bouncer skill (fail closed, exact detail strings).
import type { Check, Slip } from "../../shared/contract";
import { AGENT_ID } from "../../shared/contract";
import { actionLabel } from "../../shared/scenarios";
import { lookup } from "../chain";
import { digestOf, issuerAddress, recoverSigner } from "../chain/slip";

export async function evaluate(
  slip: Slip,
  action: string,
  actionTime: number,
  agentId: string = AGENT_ID,
): Promise<Check[]> {
  const m = slip.mandate;
  const label = actionLabel(action);
  const issuer = issuerAddress().toLowerCase();

  let signer = "";
  try {
    signer = recoverSigner(m, slip.signature);
  } catch {}

  let stampedPass = false;
  let stampedDetail = "No matching stamp on Monad";
  try {
    const want = digestOf(m).toLowerCase();
    const a = slip.anchor ? await lookup(slip.anchor.txHash) : null;
    const matches = !!a && a.status === 1 && a.from.toLowerCase() === issuer && a.data.toLowerCase() === want;
    if (matches) {
      stampedPass = a!.blockTimestamp <= actionTime;
      if (!stampedPass) stampedDetail = "Stamped on Monad after this request";
    }
  } catch {
    stampedDetail = "Could not reach Monad to verify the stamp"; // fail closed
  }

  const checks: Check[] = [
    { id: "signed", label: "Signed by the client", pass: signer.toLowerCase() === issuer, detail: "Not signed by Northwind" },
    { id: "agent", label: "The right AI", pass: agentId === m.agentId, detail: "This slip belongs to a different AI" },
    { id: "valid", label: "Still valid", pass: m.issuedAt <= actionTime && actionTime < m.expiresAt, detail: "This slip has expired or is not active yet" },
    { id: "stamped", label: "Stamped before request", pass: stampedPass, detail: stampedDetail },
    { id: "scope", label: `${label} on the slip`, pass: m.allowedActions.includes(action), detail: `${label} is not on this slip` },
  ];
  return checks.map((c) => (c.pass ? { ...c, detail: "" } : c));
}
