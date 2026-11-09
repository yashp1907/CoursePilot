import { coveredByItems, isRecurringPlaceholder, LINK_THRESHOLD, MANUAL_THRESHOLD, matchOneToOne } from "@/lib/match";
import type { Assignment, AssignmentGrade, AssignmentStatus } from "@/types/database";

export interface DupPair {
  key: string;
  /** The Canvas-linked assignment that stays. */
  keep: Assignment;
  /** The look-alike (syllabus/manual) that would be merged into it and removed. */
  drop: Assignment;
  score: number;
  reasons: string[];
  /** "covered": a recurring placeholder ("weekly quizzes") that Canvas already lists item by item. */
  kind: "match" | "covered";
}

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

const asM = (a: Assignment) => ({ title: a.title, type: a.type, due_at: a.due_at, points: a.points_possible });

/** Find syllabus/manual assignments that are really the same item as a Canvas assignment. Never pairs two Canvas items. */
export function findDuplicatePairs(assignments: Assignment[], dismissed: Set<string> = new Set()): DupPair[] {
  const out: DupPair[] = [];
  const courseIds = [...new Set(assignments.map((a) => a.course_id))];
  for (const cid of courseIds) {
    const mine = assignments.filter((a) => a.course_id === cid && !a.is_demo && a.type !== "study");
    const canvas = mine.filter((a) => a.canvas_assignment_id);
    const others = mine.filter((a) => !a.canvas_assignment_id && (a.source === "syllabus" || a.source === "website" || a.source === "manual"));
    if (!canvas.length || !others.length) continue;
    const matches = matchOneToOne(others.map(asM), canvas.map(asM), () => LINK_THRESHOLD);
    const matched = new Set<number>();
    for (const [oi, hit] of matches) {
      const drop = others[oi], keep = canvas[hit.index];
      if (drop.source === "manual" && hit.score < MANUAL_THRESHOLD) continue;
      matched.add(oi);
      const key = pairKey(keep.id, drop.id);
      if (!dismissed.has(key)) out.push({ key, keep, drop, score: hit.score, reasons: hit.reasons, kind: "match" });
    }
    others.forEach((o, oi) => {
      if (matched.has(oi) || (o.source !== "syllabus" && o.source !== "website") || !isRecurringPlaceholder(o)) return;
      if (!coveredByItems(asM(o), canvas.map(asM))) return;
      const keep = canvas.find((c) => coveredByItems({ title: o.title, type: o.type }, [asM(c)], 1)) ?? canvas[0];
      const key = pairKey(keep.id, o.id);
      if (!dismissed.has(key)) out.push({ key, keep, drop: o, score: 0.8, reasons: ["Canvas already lists these individually"], kind: "covered" });
    });
  }
  return out;
}

const RANK: Record<AssignmentStatus, number> = { not_started: 0, in_progress: 1, submitted: 2, completed: 3 };

/** What to carry over from the removed look-alike onto the Canvas assignment: only fills gaps, never overwrites. */
export function mergePatch(keep: Assignment, drop: Assignment, keepGrade?: Pick<AssignmentGrade, "points_earned" | "excused"> | null, dropGrade?: Pick<AssignmentGrade, "points_earned" | "excused"> | null) {
  const patch: Record<string, unknown> = {};
  if (!keep.category_id && drop.category_id) patch.category_id = drop.category_id;
  if (!keep.description && drop.description && !/^recurring:/i.test(drop.description)) patch.description = drop.description;
  if (!keep.estimated_minutes && drop.estimated_minutes) patch.estimated_minutes = drop.estimated_minutes;
  if (keep.priority === "medium" && drop.priority !== "medium") patch.priority = drop.priority;
  if (RANK[drop.status] > RANK[keep.status]) { patch.status = drop.status; patch.completed_at = drop.completed_at ?? new Date().toISOString(); }
  const keepHas = !!keepGrade && (keepGrade.points_earned !== null || keepGrade.excused);
  const dropHas = !!dropGrade && (dropGrade.points_earned !== null || dropGrade.excused);
  return { patch, moveGrade: !keepHas && dropHas };
}
