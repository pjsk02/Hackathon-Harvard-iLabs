import type { Decision, Receipt, ReportId } from "@shared/contract";

export type FeedItem =
  | { kind: "analyst"; id: string; text: string; attachment: string }
  | { kind: "firm"; id: string; text: string; attachment: string }
  | { kind: "status"; id: string; text: string; done: boolean }
  | { kind: "request"; id: string; action: string; why: boolean; forced: boolean; verdict: Decision | null }
  | { kind: "reply"; id: string; tone: "good" | "bad"; text: string; to: "agent" | "firm" }
  | { kind: "answer"; id: string; text: string };

export type Phase = "checking" | "checks" | "done";

/** What the JT Morgan column is showing: the current request only. */
export type Stage = {
  action: string;
  phase: Phase;
  receipt: Receipt | null;
  checksShown: number;
  earlier: { action: string; decision: Decision } | null;
};

export type Preview = "closed" | "open" | "revealed";
export type { ReportId };
