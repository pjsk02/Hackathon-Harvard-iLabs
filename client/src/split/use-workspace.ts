import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, WorkspaceResponse } from "@shared/workspace";
import { announceBoardChange } from "../board-events";

export async function workspaceRequest(path = "", body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/workspace${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : `Workspace request failed (${response.status}).`);
  return result;
}

export function useWorkspace() {
  const requestedCase=new URLSearchParams(window.location.search).get("case");
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [draft, setDraft] = useState<Draft>({ permissions: [], task: "", report: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lock = useRef(false);
  const hydrated = useRef(false);
  const refresh = useCallback(async (hydrate = false) => {
    const next = await workspaceRequest(requestedCase ? `?transactionId=${encodeURIComponent(requestedCase)}` : "") as WorkspaceResponse;
    setData(next);
    setUncertain(false);
    if (!hydrated.current || hydrate) {
      // A newly opened chat never silently reuses an old prompt or attachment.
      setDraft(hydrated.current ? next.draft : { ...next.draft, task: "", report: null });
      setDirty(false);
      hydrated.current = true;
    }
    return next;
  }, [requestedCase]);
  const reload = useCallback(async () => {
    setError(null);
    try { await refresh(); } catch (e) { setUncertain(true); setError((e as Error).message); }
  }, [refresh]);
  useEffect(() => { void reload(); }, [reload]);

  const editDraft = (next: Draft) => { setDraft(next); setDirty(true); };
  async function post(path: string, body: unknown, hydrate = false) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError(null);
    let success = false;
    try {
      await workspaceRequest(path, { ...(body as object), ...((requestedCase || data?.currentTransaction?.id) && path !== "/reset" && path !== "/reconcile" ? {transactionId:requestedCase ?? data?.currentTransaction?.id} : {}) });
      announceBoardChange();
      success = true;
    } catch (e) { setError((e as Error).message); }
    finally {
      try { await refresh(success && hydrate); }
      catch {
        setUncertain(true);
        setError(previous => `${previous ? `${previous} ` : ""}Workspace status could not be refreshed. Check status before another action.`);
      }
      lock.current = false;
      setBusy(false);
    }
    return success;
  }
  return { data, draft, editDraft, dirty, busy, error, uncertain, reload, post };
}
