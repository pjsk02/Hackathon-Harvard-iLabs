import type { Anchor } from "../../shared/contract";

export type AnchorOptions = {
  /** Retained with signed bytes; a later caller cannot replace the original fence. */
  beforeSend?: () => void;
  rebroadcast?: boolean;
};

export type RecordingResult =
  | { status: "recorded"; anchor: Anchor; txHash: string }
  | { status: "pending"; anchor: null; txHash: string | null; detail: string }
  | { status: "failed"; anchor: null; txHash: string | null; detail: string };
