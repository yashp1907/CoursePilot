import type { AssignmentType } from "@/types/database";
import type { CanvasAssignment, CanvasAssignmentGroup, CanvasCourse } from "./types";

export function guessType(a: Pick<CanvasAssignment, "name" | "submission_types">): AssignmentType {
  const n = (a.name ?? "").toLowerCase();
  const t = a.submission_types ?? [];
  if (/\b(midterm|final exam|final|exam)\b/.test(n)) return "exam";
  if (t.includes("online_quiz") || /\bquiz\b/.test(n)) return "quiz";
  if (/\blab\b/.test(n)) return "lab";
  if (/\bproject\b/.test(n)) return "project";
  if (/\b(paper|essay)\b/.test(n)) return "paper";
  if (/\b(presentation|slides)\b/.test(n)) return "presentation";
  if (/\breading\b/.test(n)) return "reading";
  if (t.includes("discussion_topic")) return "other";
  return "homework";
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export interface MappedAssignment {
  canvas_assignment_id: string;
  title: string;
  description: string | null;
  type: AssignmentType;
  due_at: string | null;
  points_possible: number | null;
  is_extra_credit: boolean;
  external_url: string | null;
  canvas_group_id: string | null;
  /** Status Canvas implies, or null when Canvas says nothing useful. */
  canvas_status: "submitted" | null;
  grade: { points: number | null; excused: boolean; graded_at: string | null } | null;
}

/** Only plain https links are ever stored or rendered (blocks javascript:/data: URLs). */
export function safeHttpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { const x = new URL(u); return x.protocol === "https:" ? x.toString() : null; } catch { return null; }
}

export function mapAssignment(a: CanvasAssignment): MappedAssignment | null {
  if (a.published === false) return null;
  const title = (a.name ?? "").trim();
  if (!title) return null;
  const sub = a.submission ?? null;
  const submitted = !!sub && ["submitted", "graded", "pending_review"].includes(sub.workflow_state ?? "") && (!!sub.submitted_at || sub.workflow_state === "graded");
  const hasScore = !!sub && typeof sub.score === "number" && sub.workflow_state === "graded";
  const excused = !!sub?.excused;
  const desc = a.description ? stripHtml(a.description).slice(0, 4000) : null;
  return {
    canvas_assignment_id: String(a.id),
    title: title.slice(0, 300),
    description: desc || null,
    type: guessType(a),
    due_at: a.due_at ? new Date(a.due_at).toISOString() : null,
    points_possible: typeof a.points_possible === "number" && a.points_possible >= 0 ? a.points_possible : null,
    is_extra_credit: false,
    external_url: safeHttpsUrl(a.html_url),
    canvas_group_id: a.assignment_group_id != null ? String(a.assignment_group_id) : null,
    canvas_status: submitted ? "submitted" : null,
    grade: hasScore || excused ? { points: hasScore ? (sub!.score as number) : null, excused, graded_at: sub?.graded_at ?? null } : null,
  };
}

export function mapCourse(c: CanvasCourse) {
  return {
    canvas_course_id: String(c.id),
    name: (c.name ?? c.course_code ?? `Canvas course ${c.id}`).trim().slice(0, 200),
    code: c.course_code ? c.course_code.trim().slice(0, 40) : null,
    semester: c.term?.name ?? null,
    weighted: !!c.apply_assignment_group_weights,
  };
}

export function mapGroup(g: CanvasAssignmentGroup, weighted: boolean) {
  return {
    canvas_group_id: String(g.id),
    name: (g.name ?? "Assignments").trim().slice(0, 120),
    weight: weighted ? Math.max(0, Math.min(100, g.group_weight ?? 0)) : 0,
    drop_lowest: Math.max(0, Math.min(50, g.rules?.drop_lowest ?? 0)),
  };
}

export const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
