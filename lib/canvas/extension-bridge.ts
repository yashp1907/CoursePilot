/**
 * Browser-side bridge to the CoursePilot Canvas Bridge extension (see /extension).
 * The extension fetches Canvas with the student's own session; this page then uploads the result to
 * /api/canvas/ingest using the student's normal CoursePilot session. No Canvas credentials pass through here.
 */
import type { SyncSummary } from "./sync";

const FROM_PAGE = "coursepilot-page";
const FROM_EXT = "coursepilot-extension";

export interface ExtensionInfo { version: string; canvasOrigin: string | null; granted: boolean }
export type Progress = { step: number; total: number; label: string };
type Bundle = { course: { id: string | number }; [k: string]: unknown };
type FetchResult = { ok: true; baseUrl: string; courses: Bundle[] } | { ok: false; error: string; code?: string };

function rpc(payload: Record<string, unknown>, onMsg: (m: Record<string, unknown>) => boolean | void, timeoutMs: number, onTimeout: () => void) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const handler = (e: MessageEvent) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || m.source !== FROM_EXT || m.id !== id) return;
    if (onMsg(m) === true) cleanup();
  };
  const timer = setTimeout(() => { cleanup(); onTimeout(); }, timeoutMs);
  function cleanup() { clearTimeout(timer); window.removeEventListener("message", handler); }
  window.addEventListener("message", handler);
  window.postMessage({ source: FROM_PAGE, id, ...payload }, window.location.origin);
}

/** Is the extension installed (and on this page)? Resolves null if it doesn't answer. */
export function pingExtension(timeoutMs = 800): Promise<ExtensionInfo | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    rpc({ type: "ping" }, (m) => { resolve(m.type === "pong" ? { version: String(m.version ?? ""), canvasOrigin: (m.canvasOrigin as string | null) ?? null, granted: !!m.granted } : null); return true; }, timeoutMs, () => resolve(null));
  });
}

export function fetchViaExtension(onProgress?: (p: Progress) => void): Promise<FetchResult> {
  return new Promise((resolve) => {
    rpc({ type: "fetch" }, (m) => {
      if (m.type === "progress") { onProgress?.(m as unknown as Progress); return false; }
      if (m.type === "result") { resolve({ ok: true, baseUrl: String(m.baseUrl), courses: (m.courses as Bundle[]) ?? [] }); return true; }
      if (m.type === "error") { resolve({ ok: false, error: String(m.error ?? "Extension error"), code: m.code as string | undefined }); return true; }
    }, 5 * 60_000, () => resolve({ ok: false, error: "The extension didn't respond. Is it installed, and is this page reloaded since you installed it?", code: "no_extension" }));
  });
}

/** Split into upload batches that stay well below hosting body limits. */
export function batchBundles<T>(bundles: T[], maxBytes = 2_500_000): T[][] {
  const batches: T[][] = [];
  let cur: T[] = [], size = 0;
  for (const b of bundles) {
    const n = JSON.stringify(b).length;
    if (cur.length && size + n > maxBytes) { batches.push(cur); cur = []; size = 0; }
    cur.push(b); size += n;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function mergeSummaries(list: SyncSummary[]): SyncSummary {
  const s: SyncSummary = { courses: 0, coursesCreated: 0, assignmentsNew: 0, assignmentsUpdated: 0, assignmentsLinked: 0, deadlineChanges: 0, gradesUpdated: 0, announcements: 0, infoQueued: 0, conflicts: [], notes: [], errors: [] };
  for (const x of list) {
    s.courses += x.courses; s.coursesCreated += x.coursesCreated; s.assignmentsNew += x.assignmentsNew; s.assignmentsUpdated += x.assignmentsUpdated; s.assignmentsLinked += x.assignmentsLinked ?? 0;
    s.deadlineChanges += x.deadlineChanges; s.gradesUpdated += x.gradesUpdated; s.announcements += x.announcements; s.infoQueued += x.infoQueued ?? 0;
    s.conflicts.push(...x.conflicts); s.notes.push(...x.notes); s.errors.push(...x.errors);
  }
  return s;
}

export type ExtSyncResult = { ok: true; summary: SyncSummary } | { ok: false; error: string; code?: string };

export async function syncViaExtension(onProgress?: (p: Progress) => void): Promise<ExtSyncResult> {
  const got = await fetchViaExtension(onProgress);
  if (!got.ok) return got;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const summaries: SyncSummary[] = [];
  for (const batch of batchBundles(got.courses)) {
    let res: Response;
    try {
      res = await fetch("/api/canvas/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: got.baseUrl, timeZone, courses: batch }) });
    } catch { return { ok: false, error: "Network error while saving your Canvas data." }; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error ?? "Couldn't save your Canvas data.", code: j.code };
    summaries.push(j.summary as SyncSummary);
  }
  return { ok: true, summary: mergeSummaries(summaries) };
}
