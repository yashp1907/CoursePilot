import type { Assignment, AssignmentType } from "@/types/database";

export const DEFAULT_MINUTES: Record<AssignmentType, number> = {
  homework: 120, quiz: 45, exam: 360, project: 300, paper: 240, lab: 120, reading: 60, presentation: 180, study: 60, other: 60,
};

/** Use the student's estimate when present; otherwise a labeled default. */
export function estimateMinutes(a: Pick<Assignment, "estimated_minutes" | "type">): { minutes: number; isDefault: boolean } {
  if (a.estimated_minutes && a.estimated_minutes > 0) return { minutes: a.estimated_minutes, isDefault: false };
  return { minutes: DEFAULT_MINUTES[a.type] ?? 60, isDefault: true };
}

export interface PriorityResult { score: number; reasons: string[] }

const HOUR = 3_600_000;

/**
 * Explainable priority score from real data only: urgency (due date), workload size, importance
 * (exam/project type and grade-category weight) and the priority the student chose.
 */
export function priorityScore(a: Assignment, now: Date, categoryWeightPct: number | null = null): PriorityResult {
  const reasons: string[] = [];
  let score = 0;
  if (!a.due_at) { score += 5; reasons.push("No due date yet"); }
  else {
    const h = (+new Date(a.due_at) - +now) / HOUR;
    const [pts, why] = h < 0 ? [100, "Overdue"] : h < 24 ? [90, "Due within 24 hours"] : h < 72 ? [70, "Due within 3 days"] : h < 168 ? [45, "Due this week"] : h < 336 ? [25, "Due within 2 weeks"] : [10, "Due later"] as const;
    score += pts; reasons.push(why as string);
  }
  const { minutes, isDefault } = estimateMinutes(a);
  score += Math.min(minutes / 60, 10) * 2;
  if (minutes >= 180) reasons.push(`About ${Math.round(minutes / 60)}h of work${isDefault ? " (default estimate)" : ""}`);
  if (a.type === "exam") { score += 15; reasons.push("Exam"); } else if (a.type === "project") { score += 8; reasons.push("Project"); }
  if (categoryWeightPct && categoryWeightPct > 0) { score += Math.min(categoryWeightPct * 0.3, 12); if (categoryWeightPct >= 20) reasons.push(`Worth ${Math.round(categoryWeightPct)}% of the course grade`); }
  if (a.priority === "high") { score += 15; reasons.push("Marked high priority by you"); } else if (a.priority === "medium") score += 5;
  return { score, reasons };
}

export const isOpen = (a: Pick<Assignment, "status">) => a.status !== "completed" && a.status !== "submitted";

export function rankAssignments(assignments: Assignment[], now: Date, weightOf: (a: Assignment) => number | null = () => null) {
  return assignments
    .filter((a) => isOpen(a) && a.type !== "study")
    .map((a) => ({ assignment: a, ...priorityScore(a, now, weightOf(a)) }))
    .sort((x, y) => y.score - x.score || (+new Date(x.assignment.due_at ?? 8.64e15) - +new Date(y.assignment.due_at ?? 8.64e15)));
}
