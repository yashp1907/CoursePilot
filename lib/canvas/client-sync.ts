import type { SyncSummary } from "./sync";
import { syncViaExtension, type Progress } from "./extension-bridge";

export type SyncResponse = { ok: true; summary: SyncSummary; info?: { done: number; error?: string } } | { ok: false; error: string; code?: string };

/** Browser helper: trigger a server-side Canvas sync. Never touches tokens. */
export async function requestCanvasSync(courseId?: string): Promise<SyncResponse> {
  try {
    const res = await fetch("/api/canvas/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, courseId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? "Canvas sync failed.", code: json.code };
    return { ok: true, summary: json.summary };
  } catch {
    return { ok: false, error: "Network error while syncing with Canvas." };
  }
}

export function summarizeSync(s: SyncSummary): string {
  const parts = [
    s.assignmentsNew && `${s.assignmentsNew} new assignment${s.assignmentsNew === 1 ? "" : "s"}`,
    s.assignmentsLinked && `${s.assignmentsLinked} matched to existing`,
    s.assignmentsUpdated && `${s.assignmentsUpdated} updated`,
    s.deadlineChanges && `${s.deadlineChanges} deadline change${s.deadlineChanges === 1 ? "" : "s"}`,
    s.gradesUpdated && `${s.gradesUpdated} grade${s.gradesUpdated === 1 ? "" : "s"}`,
    s.infoQueued && `course info for ${s.infoQueued} course${s.infoQueued === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Everything is up to date";
}

export type CanvasMethod = "api" | "extension";

/** Sync using whichever method this connection uses (token/OAuth on the server, or the browser extension). */
export async function syncCanvas(method: CanvasMethod, opts: { courseId?: string; onProgress?: (p: Progress) => void; onInfoProgress?: (label: string, remaining: number) => void } = {}): Promise<SyncResponse> {
  const r: SyncResponse = method === "extension" ? await syncViaExtension(opts.onProgress) : await requestCanvasSync(opts.courseId);
  if (!r.ok) return r;
  // Courses whose Canvas pages changed get read in the background (one per request) so the sync itself stays fast.
  const info = await enrichCourseInfo(opts.onInfoProgress);
  return { ...r, info };
}

/** Read the next pending course's Canvas pages until none remain. Never throws; failures are reported, not fatal. */
export async function enrichCourseInfo(onProgress?: (label: string, remaining: number) => void): Promise<{ done: number; error?: string }> {
  let done = 0;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch("/api/canvas/course-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { done, error: j.error ?? "Couldn't read course pages." };
      if (!j.processed) return { done };
      done++;
      onProgress?.(j.processed.label, j.remaining ?? 0);
      if ((j.remaining ?? 0) <= 0) return { done };
      if (j.processed.status === "failed" && (j.remaining ?? 0) > 0 && done >= 15) break;
    } catch { return { done, error: "Network error while reading course pages." }; }
  }
  return { done };
}
