import { computeGrade } from "@/lib/grades/calculations";
import { buildItems, buildScheme } from "@/lib/grades/adapt";
import { displayStatus } from "@/lib/utils/dates";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

export interface TrendPoint { date: string; label: string; percent: number }

/**
 * Course grade after each graded item, in the order grades were recorded (cumulative, graded work only).
 * Uses the same deterministic engine as everywhere else. Needs graded_at on grades.
 */
export function gradeTrend(course: Course, categories: GradingCategoryRow[], assignments: Assignment[], grades: (AssignmentGrade & { graded_at?: string | null })[], presetKey?: string | null): TrendPoint[] {
  const scheme = buildScheme(course, categories, presetKey);
  const mine = assignments.filter((a) => a.course_id === course.id);
  const dated = grades.filter((g) => g.points_earned !== null && g.graded_at && mine.some((a) => a.id === g.assignment_id))
    .sort((a, b) => +new Date(a.graded_at!) - +new Date(b.graded_at!));
  const out: TrendPoint[] = [];
  const included: AssignmentGrade[] = [];
  for (const g of dated) {
    included.push(g);
    const r = computeGrade(scheme, buildItems(mine, included));
    if (r.percent !== null) out.push({ date: g.graded_at!, label: mine.find((a) => a.id === g.assignment_id)?.title ?? "", percent: Math.round(r.percent * 100) / 100 });
  }
  return out;
}

export interface RiskFlag { code: string; text: string }
export interface CourseRisk { course: Course; flags: RiskFlag[] }

const DAY = 86_400_000;

/**
 * Explainable risk indicators. Each flag states the data behind it; nothing labels a student as failing,
 * and a low grade is only flagged when enough work has been graded to mean something.
 */
export function courseRisks(courses: Course[], categories: GradingCategoryRow[], assignments: Assignment[], grades: AssignmentGrade[], presetKey: string | null, now: Date): CourseRisk[] {
  return courses.map((course) => {
    const flags: RiskFlag[] = [];
    const mine = assignments.filter((a) => a.course_id === course.id);
    const cats = categories.filter((c) => c.course_id === course.id);
    const overdue = mine.filter((a) => displayStatus(a, now) === "overdue" && a.type !== "study");
    if (overdue.length >= 2) flags.push({ code: "overdue", text: `${overdue.length} overdue assignments (${overdue.slice(0, 2).map((a) => a.title).join(", ")}${overdue.length > 2 ? "…" : ""}).` });
    else if (overdue.length === 1) flags.push({ code: "overdue", text: `1 overdue assignment: ${overdue[0].title}.` });

    const result = computeGrade(buildScheme(course, cats, presetKey), buildItems(mine, grades));
    if (result.percent !== null && result.percent < 70 && result.gradedCount >= 3) flags.push({ code: "low_grade", text: `Current grade is ${result.percent.toFixed(1)}% based on ${result.gradedCount} graded items.` });

    for (const a of mine) {
      if (a.type !== "exam" || !a.due_at || a.status === "completed" || a.status === "submitted") continue;
      const t = +new Date(a.due_at) - +now;
      const w = cats.find((c) => c.id === a.category_id)?.weight;
      if (t > 0 && t <= 14 * DAY && w && Number(w) >= 25) flags.push({ code: "big_exam", text: `${a.title} is in ${Math.ceil(t / DAY)} day${Math.ceil(t / DAY) === 1 ? "" : "s"} and is worth ${Number(w)}% of the grade.` });
    }
    const trend = gradeTrend(course, cats, mine, grades as never, presetKey);
    if (trend.length >= 4) {
      const last = trend[trend.length - 1].percent, before = trend[trend.length - 4].percent;
      if (before - last >= 5) flags.push({ code: "dropping", text: `Course grade moved from ${before.toFixed(1)}% to ${last.toFixed(1)}% over the last 3 graded items.` });
    }
    return { course, flags };
  });
}
