import { coveredByItems, isRecurringPlaceholder, LINK_THRESHOLD, MANUAL_THRESHOLD, matchOneToOne, matchScore } from "@/lib/match";
import type { Assignment, AssignmentType } from "@/types/database";

export interface SyllabusItem {
  title: string;
  type: AssignmentType;
  due_at: string | null;
  points: number | null;
  category: string | null;
  recurrence: string | null;
  /** Link to the assignment's own page/spec (course websites). */
  url?: string | null;
}

export type SkipReason = "in_canvas" | "already_added" | "covered_by_canvas" | "duplicate_in_syllabus";

export interface SyllabusImportPlan {
  inserts: { index: number; item: SyllabusItem }[];
  /** Existing assignments that were missing a date/points the syllabus provides: filled in, nothing overwritten. */
  enrich: { id: string; title: string; patch: { due_at?: string; points_possible?: number; external_url?: string } }[];
  /** Matched items whose date differs from the source: only proposed for sources allowed to update (never Canvas, never a date you edited). */
  changes: { index: number; id: string; title: string; from: string; to: string }[];
  skipped: { index: number; title: string; reason: SkipReason; matchedTitle?: string }[];
}

type Existing = Pick<Assignment, "id" | "title" | "type" | "due_at" | "points_possible" | "source" | "canvas_assignment_id" | "description"> & Partial<Pick<Assignment, "user_edited_fields" | "external_url">>;

export interface PlanOptions {
  /** Sources whose existing items may get their due date updated when the incoming date differs (e.g. a course website updating a syllabus date). */
  updatableSources?: string[];
}

export const REASON_TEXT: Record<SkipReason, string> = {
  in_canvas: "Already in Canvas", already_added: "Already in your list", covered_by_canvas: "Covered by your Canvas assignments", duplicate_in_syllabus: "Repeated in this syllabus",
};

/**
 * Decide what importing syllabus items should do given what the student already has.
 * - Items that match an existing assignment (Canvas, earlier syllabus import, or manual) are not added again.
 * - If the match is missing a due date or points that the syllabus knows, those blanks are filled (never overwritten).
 * - A "weekly quizzes"-style entry is skipped when Canvas already lists the individual quizzes.
 * - Repeats inside the syllabus itself (an exam listed under both assignments and key dates) are collapsed.
 */
export function planSyllabusImport(existing: Existing[], items: SyllabusItem[], selected: number[], opts: PlanOptions = {}): SyllabusImportPlan {
  const plan: SyllabusImportPlan = { inserts: [], enrich: [], changes: [], skipped: [] };
  const pool = existing.filter((a) => a.type !== "study");
  const canvasPool = pool.filter((a) => a.canvas_assignment_id);
  const chosen = selected.filter((i) => items[i]).sort((a, b) => a - b);
  const asMatchable = (a: { title: string; type?: string | null; due_at?: string | null; points_possible?: number | null; points?: number | null }) => ({ title: a.title, type: a.type, due_at: a.due_at, points: a.points_possible ?? a.points ?? null });

  const recurring = new Set(chosen.filter((i) => isRecurringPlaceholder({ title: items[i].title, description: items[i].recurrence ? `Recurring: ${items[i].recurrence}` : null, due_at: items[i].due_at })));
  const concrete = chosen.filter((i) => !recurring.has(i));

  const matches = matchOneToOne(concrete.map((i) => asMatchable(items[i])), pool.map(asMatchable), (pi) => (pool[pi].source === "manual" ? MANUAL_THRESHOLD : LINK_THRESHOLD));
  const taken: { index: number; item: SyllabusItem }[] = [];

  concrete.forEach((idx, ci) => {
    const item = items[idx];
    const hit = matches.get(ci);
    if (hit) {
      const ex = pool[hit.index];
      plan.skipped.push({ index: idx, title: item.title, reason: ex.canvas_assignment_id ? "in_canvas" : "already_added", matchedTitle: ex.title });
      const patch: { due_at?: string; points_possible?: number; external_url?: string } = {};
      if (!ex.due_at && item.due_at) patch.due_at = item.due_at;
      if (ex.points_possible == null && item.points != null) patch.points_possible = item.points;
      if (!ex.external_url && item.url) patch.external_url = item.url;
      if (Object.keys(patch).length) plan.enrich.push({ id: ex.id, title: ex.title, patch });
      // A more current source corrects an older, non-Canvas date (and never one the student set themselves).
      if (ex.due_at && item.due_at && !ex.canvas_assignment_id && opts.updatableSources?.includes(ex.source) && !(ex.user_edited_fields ?? []).includes("due_at")
        && Math.abs(+new Date(ex.due_at) - +new Date(item.due_at)) > 3_600_000) plan.changes.push({ index: idx, id: ex.id, title: ex.title, from: ex.due_at, to: item.due_at });
      return;
    }
    // Same item listed twice within this syllabus import?
    const dup = taken.find((t) => matchScore(asMatchable(t.item), asMatchable(item)).score >= LINK_THRESHOLD);
    if (dup) { plan.skipped.push({ index: idx, title: item.title, reason: "duplicate_in_syllabus", matchedTitle: dup.item.title }); return; }
    taken.push({ index: idx, item });
    plan.inserts.push({ index: idx, item });
  });

  for (const idx of recurring) {
    const item = items[idx];
    if (coveredByItems({ title: item.title, type: item.type }, canvasPool.map(asMatchable))) plan.skipped.push({ index: idx, title: item.title, reason: "covered_by_canvas" });
    else {
      const ex = pool.find((a) => matchScore(asMatchable(a), asMatchable(item)).score >= LINK_THRESHOLD && isRecurringPlaceholder(a));
      if (ex) plan.skipped.push({ index: idx, title: item.title, reason: "already_added", matchedTitle: ex.title });
      else plan.inserts.push({ index: idx, item });
    }
  }
  plan.inserts.sort((a, b) => a.index - b.index);
  return plan;
}
