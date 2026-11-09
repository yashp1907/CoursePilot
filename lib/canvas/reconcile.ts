import type { Assignment } from "@/types/database";
import type { MappedAssignment } from "./map";

export type TrackedField = "title" | "description" | "due_at" | "points_possible" | "type" | "external_url";
const FIELDS: TrackedField[] = ["title", "description", "due_at", "points_possible", "type", "external_url"];

export interface HistoryEntry { field: string; old_value: string | null; new_value: string | null }
export interface Conflict { field: string; mine: string | null; canvas: string | null }

export interface Reconciled {
  patch: Partial<Record<TrackedField | "status", unknown>>;
  history: HistoryEntry[];
  /** Canvas changed a field the user has edited: we kept the user's value. */
  conflicts: Conflict[];
  dueChange: { from: string | null; to: string | null; suppressed: boolean } | null;
}

const norm = (f: TrackedField, v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (f === "due_at") return new Date(String(v)).toISOString();
  return String(v);
};

/**
 * Decide how to apply a Canvas assignment to an existing local one.
 * Rules: user-edited fields are never overwritten (we report a conflict instead); the type is only
 * refreshed if the user has not edited it; a user-completed assignment is never moved backwards.
 */
export interface ReconcileOptions {
  /** Fields never changed by this pass (e.g. keep the existing type when linking a syllabus item to Canvas). */
  skipFields?: TrackedField[];
}

export function reconcileAssignment(existing: Pick<Assignment, TrackedField | "status" | "user_edited_fields">, incoming: MappedAssignment, opts: ReconcileOptions = {}): Reconciled {
  const out: Reconciled = { patch: {}, history: [], conflicts: [], dueChange: null };
  const edited = new Set(existing.user_edited_fields ?? []);
  for (const f of FIELDS) {
    const theirs = norm(f, incoming[f]);
    const mine = norm(f, existing[f]);
    if (opts.skipFields?.includes(f)) continue;
    // Canvas having *no value* is "no information", never an instruction to erase what we know (a date from the
    // syllabus, your notes, points). Only a real, different Canvas value changes these.
    if (theirs === null && (f === "description" || f === "due_at" || f === "points_possible" || f === "external_url")) continue;
    if (f === "type" && existing.type !== undefined && edited.has("type")) continue;
    if (theirs === mine) continue;
    if (f === "due_at" && Date.parse(theirs ?? "") === Date.parse(mine ?? "")) continue;
    if (edited.has(f)) {
      out.conflicts.push({ field: f, mine, canvas: theirs });
      if (f === "due_at") out.dueChange = { from: mine, to: theirs, suppressed: true };
      continue;
    }
    out.patch[f] = theirs;
    out.history.push({ field: f, old_value: mine, new_value: theirs });
    if (f === "due_at") out.dueChange = { from: mine, to: theirs, suppressed: false };
  }
  if (incoming.canvas_status === "submitted" && existing.status !== "completed" && existing.status !== "submitted" && !edited.has("status")) {
    out.patch.status = "submitted";
    out.history.push({ field: "status", old_value: existing.status, new_value: "submitted" });
  }
  return out;
}

/** "IOE 310 Homework 4 deadline changed from November 12 to November 14." */
export function describeDueChange(label: string, from: string | null, to: string | null, timeZone = "UTC"): string {
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: safeZone(timeZone), month: "long", day: "numeric" }).format(new Date(iso)) : null);
  const a = fmt(from), b = fmt(to);
  if (a && b) return a === b ? `${label} due time changed on ${b}.` : `${label} deadline changed from ${a} to ${b}.`;
  if (b) return `${label} now has a deadline: ${b}.`;
  return `${label} no longer has a deadline (was ${a}).`;
}

function safeZone(tz: string): string {
  try { Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}
