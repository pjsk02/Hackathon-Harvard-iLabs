// Tab-local presentation only. No returned data, signatures or write queue is
// persisted. A server-issued session identity must match before anything is
// restored; reset/restart and missing receipt references invalidate progress.
import type { Receipt, ReportId, StateResponse } from "@shared/contract";
import { COPY } from "./labels";
import type { Attachment } from "./split/upload";

type Upload = Extract<Attachment, { kind: "upload" }>;
type CompletedRun = { permission: string; receiptIds: string[] };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Presentation = {
  sessionId: string | null;
  attached: Attachment;
  injectedUpload: Upload | null;
  examples: Record<ReportId, CompletedRun | null>;
  activeStep: number;
  lastReceiptIds: string[];
  serverBusy: boolean;
  storageWarning: string | null;
};
const KEY = "envoi-presentation";
export const builtin = (reportId: ReportId): Attachment => ({ kind: "builtin", reportId, fileName: COPY.attachments[reportId] });
const empty = (sessionId: string | null): Presentation => ({
  sessionId, attached: builtin("clean"), injectedUpload: null,
  examples: { clean: null, poisoned: null }, activeStep: 1, lastReceiptIds: [],
  serverBusy: false, storageWarning: null,
});
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 3 &&
  value.every((id) => typeof id === "string" && id.length <= 100);

function attachment(value: unknown): Attachment | null {
  if (!object(value)) return null;
  if (value.kind === "builtin" && ["clean", "poisoned"].includes(value.reportId)) return builtin(value.reportId);
  if (value.kind !== "upload" || typeof value.fileName !== "string" || value.fileName.length > 255 ||
    !/\.(docx|txt|md|html?)$/i.test(value.fileName) ||
    typeof value.text !== "string" || !value.text.trim() || value.text.length > 60_000 ||
    !Array.isArray(value.parts) || value.parts.length > 60_000 ||
    !value.parts.every((part: unknown) => object(part) && typeof part.text === "string" && typeof part.hidden === "boolean") ||
    value.parts.map((part: { text: string }) => part.text).join("\n\n") !== value.text) return null;
  return { kind: "upload", fileName: value.fileName, text: value.text, parts: value.parts };
}

function restore(raw: string | null): Presentation | null {
  if (!raw || raw.length > 1_000_000) return null;
  const value: unknown = JSON.parse(raw);
  if (!object(value) || typeof value.sessionId !== "string" || !object(value.examples)) return null;
  const attached = attachment(value.attached);
  const upload = value.injectedUpload === null ? null : attachment(value.injectedUpload);
  if (!attached || (upload && upload.kind !== "upload") || !ids(value.lastReceiptIds)) return null;
  const result = { ...empty(value.sessionId), attached, injectedUpload: upload as Upload | null };
  for (const reportId of ["clean", "poisoned"] as const) {
    const run = value.examples[reportId];
    if (run !== null && (!object(run) || typeof run.permission !== "string" || !ids(run.receiptIds))) return null;
    result.examples[reportId] = run;
  }
  result.activeStep = [1, 2, 3, 4].includes(value.activeStep) ? value.activeStep : 1;
  result.lastReceiptIds = value.lastReceiptIds;
  return result;
}

export function createPresentationStore(storage?: StorageLike) {
  let current = empty(null);
  let saved: Presentation | null = null;
  let permission: string | null = null;
  let storageWarning: string | null = storage ? null : "This browser cannot save the report across reloads; keep this page open.";
  const listeners = new Set<() => void>();
  try { saved = restore(storage?.getItem(KEY) ?? null); }
  catch { storageWarning = "The saved report could not be restored; upload it again."; }

  function publish(next: Presentation) {
    current = { ...next, storageWarning };
    if (current.sessionId) {
      try {
        storage?.setItem(KEY, JSON.stringify({
          ...current, serverBusy: false, storageWarning: null,
        }));
      } catch {
        storageWarning = "This browser could not save the report across reloads; keep this page open.";
        current = { ...current, storageWarning };
      }
    }
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acceptState(sessionId: string, state: StateResponse, serverBusy = false) {
      const first = current.sessionId === null;
      let next = current.sessionId === sessionId ? current
        : first && saved?.sessionId === sessionId ? saved : empty(sessionId);
      saved = null;
      permission = state.slips.find((slip) => slip.label === "Original")?.digest ?? null;
      const known = new Set(state.receipts.map((receipt) => receipt.id));
      const examples = { ...next.examples };
      for (const reportId of ["clean", "poisoned"] as const) {
        const run = examples[reportId];
        if (run && (run.permission !== permission || !run.receiptIds.every((id) => known.has(id)))) examples[reportId] = null;
      }
      next = { ...next, examples, serverBusy, lastReceiptIds: next.lastReceiptIds.filter((id) => known.has(id)) };
      if (!permission) next.activeStep = 1;
      else if (next.activeStep === 1) next.activeStep = 2;
      publish(next);
    },
    attach(upload: Attachment) {
      publish({ ...current, attached: upload, injectedUpload: upload.kind === "upload" ? upload : current.injectedUpload });
    },
    selectReport(reportId: ReportId) {
      publish({ ...current, attached: reportId === "poisoned" && current.injectedUpload ? current.injectedUpload : builtin(reportId) });
    },
    setStep(activeStep: number) { publish({ ...current, activeStep }); },
    completed(reportId: ReportId, receipts: Receipt[]) {
      if (!current.sessionId || !permission) return;
      const receiptIds = receipts.map((receipt) => receipt.id);
      publish({ ...current, examples: { ...current.examples, [reportId]: { permission, receiptIds } }, lastReceiptIds: receiptIds });
    },
    showReceipts(receipts: Receipt[]) { publish({ ...current, lastReceiptIds: receipts.map((receipt) => receipt.id) }); },
  };
}
