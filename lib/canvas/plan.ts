import type { Assignment, GradingCategoryRow } from "@/types/database";
import { categoryNamesMatch, LINK_THRESHOLD, MANUAL_THRESHOLD, matchOneToOne } from "@/lib/match";
import { type MappedAssignment, mapGroup } from "./map";
import { describeDueChange, reconcileAssignment, type Conflict, type HistoryEntry } from "./reconcile";
import type { CanvasAssignmentGroup } from "./types";

export interface PlannedNotification { kind: string; title: string; body: string | null; dedupe_key: string; link: string }

export interface LinkPlan {
  id: string;
  canvasId: string;
  incoming: MappedAssignment;
  /** Column updates, including canvas_assignment_id (and source for syllabus items). */
  patch: Record<string, unknown>;
  history: HistoryEntry[];
  conflicts: Conflict[];
  fromSource: string;
  score: number;
  reasons: string[];
  title: string;
}

export interface AssignmentPlan {
  inserts: MappedAssignment[];
  /** Existing syllabus/manual assignments recognized as the same item as a new Canvas assignment: adopted, not duplicated. */
  links: LinkPlan[];
  updates: { id: string; patch: Record<string, unknown>; canvasId: string }[];
  history: ({ assignmentId: string } & HistoryEntry)[];
  conflicts: { assignmentId: string; title: string; conflicts: Conflict[] }[];
  notifications: PlannedNotification[];
  unchanged: number;
  /** Local Canvas-sourced assignments no longer returned by Canvas (kept, never deleted). */
  missingFromCanvas: number;
}

/** Pure planning step: compare Canvas data to what we have and decide inserts/updates/notifications. */
export function planAssignmentSync(opts: {
  existing: Assignment[];
  incoming: MappedAssignment[];
  courseId: string;
  courseLabel: string;
  timeZone: string;
}): AssignmentPlan {
  const plan: AssignmentPlan = { inserts: [], links: [], updates: [], history: [], conflicts: [], notifications: [], unchanged: 0, missingFromCanvas: 0 };
  const byCanvas = new Map(opts.existing.filter((a) => a.canvas_assignment_id).map((a) => [a.canvas_assignment_id as string, a]));
  const seen = new Set<string>();

  for (const inc of opts.incoming) {
    if (seen.has(inc.canvas_assignment_id)) continue; // duplicate in payload
    seen.add(inc.canvas_assignment_id);
    const ex = byCanvas.get(inc.canvas_assignment_id);
    if (!ex) { plan.inserts.push(inc); continue; }
    const r = reconcileAssignment(ex, inc);
    if (Object.keys(r.patch).length === 0) plan.unchanged++; else plan.updates.push({ id: ex.id, patch: r.patch, canvasId: inc.canvas_assignment_id });
    for (const h of r.history) plan.history.push({ assignmentId: ex.id, ...h });
    if (r.conflicts.length) plan.conflicts.push({ assignmentId: ex.id, title: ex.title, conflicts: r.conflicts });
    if (r.dueChange && !r.dueChange.suppressed) {
      plan.notifications.push({
        kind: "deadline_changed", title: "Deadline changed",
        body: describeDueChange(`${opts.courseLabel} ${ex.title}`, r.dueChange.from, r.dueChange.to, opts.timeZone),
        dedupe_key: `due-change:${ex.id}:${r.dueChange.to ?? "none"}`, link: `/courses/${opts.courseId}?tab=assignments`,
      });
    }
  }
  // Adopt look-alike syllabus/manual assignments instead of creating duplicates.
  if (plan.inserts.length) {
    const pool = opts.existing.filter((a) => !a.canvas_assignment_id && !a.is_demo && a.type !== "study" && (a.source === "syllabus" || a.source === "website" || a.source === "manual"));
    if (pool.length) {
      const matches = matchOneToOne(
        plan.inserts.map((i) => ({ title: i.title, type: i.type, due_at: i.due_at, points: i.points_possible })),
        pool.map((a) => ({ title: a.title, type: a.type, due_at: a.due_at, points: a.points_possible })),
        (pi) => (pool[pi].source === "manual" ? MANUAL_THRESHOLD : LINK_THRESHOLD),
      );
      const linked = new Set<number>();
      for (const [ci, hit] of matches) {
        const inc = plan.inserts[ci]; const ex = pool[hit.index];
        // Items the student typed in themselves keep their own values (conflicts are reported); syllabus items take Canvas's.
        const protectedFields = ex.source === "manual" ? ["title", "description", "due_at", "points_possible", "type", "external_url", "status"] : ex.user_edited_fields ?? [];
        const r = reconcileAssignment({ ...ex, user_edited_fields: protectedFields }, inc, { skipFields: ["type"] });
        const patch: Record<string, unknown> = { ...r.patch, canvas_assignment_id: inc.canvas_assignment_id };
        if (!patch.external_url && inc.external_url && !ex.external_url) patch.external_url = inc.external_url;
        if (ex.source === "syllabus" || ex.source === "website") patch.source = "canvas";
        plan.links.push({ id: ex.id, canvasId: inc.canvas_assignment_id, incoming: inc, patch, history: [{ field: "canvas_link", old_value: null, new_value: `${ex.source} "${ex.title}" ↔ Canvas "${inc.title}"` }, ...r.history], conflicts: r.conflicts, fromSource: ex.source, score: hit.score, reasons: hit.reasons, title: ex.title });
        linked.add(ci);
      }
      plan.inserts = plan.inserts.filter((_, i) => !linked.has(i));
    }
  }
  if (plan.inserts.length) {
    plan.notifications.push({
      kind: "canvas_new", title: `${plan.inserts.length} new Canvas assignment${plan.inserts.length === 1 ? "" : "s"} in ${opts.courseLabel}`,
      body: plan.inserts.slice(0, 4).map((i) => i.title).join(", ") + (plan.inserts.length > 4 ? "…" : ""),
      dedupe_key: `canvas-new:${opts.courseId}:${plan.inserts.map((i) => i.canvas_assignment_id).sort().join(",").slice(0, 120)}`,
      link: `/courses/${opts.courseId}?tab=assignments`,
    });
  }
  plan.missingFromCanvas = opts.existing.filter((a) => a.source === "canvas" && a.canvas_assignment_id && !seen.has(a.canvas_assignment_id)).length;
  return plan;
}

export interface CategoryPlan {
  /** Existing categories to tag with a Canvas group id. */
  link: { id: string; canvas_group_id: string }[];
  create: ReturnType<typeof mapGroup>[];
  /** Existing categories whose weight/drop differs from Canvas; we keep the user's values and report. */
  differences: { name: string; mine: { weight: number; drop: number }; canvas: { weight: number; drop: number } }[];
}

export function planCategorySync(existing: GradingCategoryRow[], groups: CanvasAssignmentGroup[], weighted: boolean): CategoryPlan {
  const plan: CategoryPlan = { link: [], create: [], differences: [] };
  const byGroupId = new Map(existing.filter((c) => (c as { canvas_group_id?: string | null }).canvas_group_id).map((c) => [(c as { canvas_group_id?: string }).canvas_group_id!, c]));
  const used = new Set<string>();
  for (const g of groups) {
    const m = mapGroup(g, weighted);
    let match = byGroupId.get(m.canvas_group_id);
    if (!match) {
      // Same meaning, not just same text ("Homework" ~ "Homework Assignments", "Quizzes" ~ "Quiz").
      const cand = existing.find((c) => !used.has(c.id) && !(c as { canvas_group_id?: string | null }).canvas_group_id && categoryNamesMatch(c.name, m.name));
      if (cand) { match = cand; plan.link.push({ id: cand.id, canvas_group_id: m.canvas_group_id }); }
    }
    if (!match) { plan.create.push(m); continue; }
    used.add(match.id);
    if (weighted && (Number(match.weight) !== m.weight || match.drop_lowest !== m.drop_lowest)) {
      plan.differences.push({ name: match.name, mine: { weight: Number(match.weight), drop: match.drop_lowest }, canvas: { weight: m.weight, drop: m.drop_lowest } });
    }
  }
  return plan;
}

export type GradeDecision = "write" | "skip" | "conflict";

/** Canvas is authoritative for published grades, but a different manually-entered grade is never silently replaced. */
export function decideGrade(
  existing: { points_earned: number | null; excused: boolean; source: string } | undefined,
  incoming: { points: number | null; excused: boolean },
): GradeDecision {
  if (!existing) return "write";
  const same = Number(existing.points_earned ?? NaN) === Number(incoming.points ?? NaN) || (existing.points_earned === null && incoming.points === null);
  if (same && existing.excused === incoming.excused) return "skip";
  return existing.source === "canvas" ? "write" : "conflict";
}
