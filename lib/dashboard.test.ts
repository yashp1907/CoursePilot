import { describe, expect, it } from "vitest";
import { computeDashboard } from "./dashboard";
import { computeGrade } from "@/lib/grades/calculations";
import { STANDARD_SCALE } from "@/lib/grades/scales";
import type { Assignment, Course } from "@/types/database";
import type { CourseSummary } from "./course-stats";

const now = new Date("2026-11-07T12:00:00Z");
const day = (n: number) => new Date(+now + n * 86_400_000).toISOString();
const mk = (o: Partial<Assignment>): Assignment => ({
  id: Math.random().toString(), user_id: "u", course_id: "c", category_id: null, title: "T", description: null, type: "homework", due_at: null,
  estimated_minutes: null, priority: "medium", status: "not_started", points_possible: null, is_extra_credit: false, source: "manual",
  canvas_assignment_id: null, external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", ...o,
});
const course = { id: "c", name: "Course", code: "IOE 310", credits: 4 } as Course;
const summary = (percent: number | null, graded = 3): CourseSummary => {
  const g = computeGrade({ mode: "points", categories: [], scale: STANDARD_SCALE, curve: 0 }, percent === null ? [] : Array.from({ length: graded }, (_, i) => ({ id: String(i), categoryId: null, name: "x", earned: percent, possible: 100 })));
  return { course, grade: g, total: 0, done: 0, overdue: 0, next: null };
};

describe("computeDashboard", () => {
  it("counts only open, upcoming items as due this week", () => {
    const d = computeDashboard([
      mk({ due_at: day(2) }), mk({ due_at: day(9) }), mk({ due_at: day(1), status: "completed" }), mk({ due_at: day(-1) }),
    ], [summary(90)], now);
    expect(d.dueThisWeek).toHaveLength(1);
    expect(d.overdue).toHaveLength(1);
  });
  it("counts upcoming exams", () => {
    const d = computeDashboard([mk({ type: "exam", due_at: day(20) }), mk({ type: "exam", due_at: day(-3) })], [], now);
    expect(d.exams).toHaveLength(1);
  });
  it("only reports GPA when grades and credits exist", () => {
    expect(computeDashboard([], [summary(null)], now).gpa).toBeNull();
    expect(computeDashboard([], [summary(95)], now).gpa?.gpa).toBeCloseTo(4, 5);
  });
  it("flags a low grade only with enough graded items, and phrases it carefully", () => {
    expect(computeDashboard([], [summary(60, 1)], now).insights.some((i) => i.id.startsWith("grade-"))).toBe(false);
    const i = computeDashboard([], [summary(60, 3)], now).insights.find((x) => x.id.startsWith("grade-"));
    expect(i?.title).toMatch(/may deserve attention/);
    expect(i?.detail).toMatch(/graded work/);
  });
  it("flags a busy week and overdue work", () => {
    const d = computeDashboard(Array.from({ length: 5 }, (_, i) => mk({ due_at: day(i + 1) })).concat(mk({ due_at: day(-2), title: "Late" })), [], now);
    expect(d.insights.map((i) => i.id)).toEqual(expect.arrayContaining(["busy", "overdue"]));
  });
  it("produces no insights from empty data", () => {
    expect(computeDashboard([], [], now).insights).toEqual([]);
  });
});
