import { displayStatus } from "@/lib/utils/dates";
import { computeGpa } from "@/lib/grades/gpa";
import type { CourseSummary } from "@/lib/course-stats";
import type { Assignment } from "@/types/database";

export interface Insight { id: string; tone: "info" | "warning" | "danger"; title: string; detail: string; href?: string }

const DAY = 86_400_000;
const isOpen = (a: Assignment) => a.status !== "completed" && a.status !== "submitted";

export function computeDashboard(assignments: Assignment[], summaries: CourseSummary[], now = new Date()) {
  const open = assignments.filter(isOpen);
  const weekEnd = new Date(+now + 7 * DAY);
  const dueThisWeek = open.filter((a) => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= weekEnd);
  const overdue = assignments.filter((a) => displayStatus(a, now) === "overdue");
  const exams = open.filter((a) => a.type === "exam" && a.due_at && new Date(a.due_at) >= now);
  const gpa = computeGpa(summaries.map((s) => ({ credits: s.course.credits, letter: s.grade.letter })));
  const examsThisWeek = dueThisWeek.filter((a) => a.type === "exam");

  const insights: Insight[] = [];
  if (overdue.length > 0) insights.push({ id: "overdue", tone: "danger", title: `${overdue.length} overdue assignment${overdue.length === 1 ? "" : "s"}`, detail: `Oldest: "${overdue.sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!))[0].title}".`, href: "/assignments" });
  const soon = open.filter((a) => a.due_at && new Date(a.due_at) >= now && +new Date(a.due_at) - +now <= DAY).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
  if (soon.length > 0) insights.push({ id: "soon", tone: "warning", title: `${soon.length} due in the next 24 hours`, detail: soon.slice(0, 3).map((a) => a.title).join(", "), href: "/assignments" });
  if (dueThisWeek.length >= 5 || examsThisWeek.length >= 2) {
    insights.push({ id: "busy", tone: "warning", title: "Busy week ahead", detail: `${examsThisWeek.length} exam${examsThisWeek.length === 1 ? "" : "s"} and ${dueThisWeek.length - examsThisWeek.length} other item${dueThisWeek.length - examsThisWeek.length === 1 ? "" : "s"} due in the next 7 days.`, href: "/calendar" });
  }
  for (const s of summaries) {
    const g = s.grade;
    const gradedCount = g.gradedCount;
    if (g.percent !== null && g.percent < 70 && gradedCount >= 2) {
      insights.push({ id: `grade-${s.course.id}`, tone: "warning", title: `${s.course.code ?? s.course.name} grade may deserve attention`, detail: `Current grade is ${g.percent.toFixed(1)}% across ${gradedCount} graded items. This is based only on graded work so far.`, href: `/courses/${s.course.id}?tab=grades` });
    }
  }
  const nodate = open.filter((a) => !a.due_at && a.type !== "study").length;
  if (nodate >= 3) insights.push({ id: "nodate", tone: "info", title: `${nodate} incomplete assignments have no due date`, detail: "Add dates so they show up on your calendar and deadlines.", href: "/assignments" });

  return { activeCourses: summaries.length, dueThisWeek, overdue, exams, gpa, insights };
}
