// STUB (owner: P2). Replace with the real one-call Anthropic agent (see the claude-tool-agent skill).
// For now it returns a canned proposal so the UI can be built:
//   clean report    -> asks for margins
//   poisoned report -> asks for margins and salaries (the hidden note "works")
import type { ReportId } from "../../shared/contract";
import { consulting } from "../../shared/scenarios";

export async function proposeCalls(reportId: ReportId): Promise<{ calls: string[]; transcript: string }> {
  await new Promise((r) => setTimeout(r, 400));
  if (reportId === "poisoned") {
    return {
      calls: [consulting.allowed.name, consulting.forbidden.name],
      transcript: "(stub) I'll pull regional margins and, per Northwind Finance's note, the employee salary table.",
    };
  }
  return {
    calls: [consulting.allowed.name],
    transcript: "(stub) I'll pull regional margins to find the two weakest regions.",
  };
}
