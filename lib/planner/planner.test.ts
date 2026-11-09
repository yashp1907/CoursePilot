import { describe, expect, it } from "vitest";
import { estimateMinutes, priorityScore, rankAssignments } from "./priority";
import { availabilityFor, dayKey, planWeek } from "./schedule";
import { describeWeek, weeklyWorkload } from "./workload";
import { courseRisks, gradeTrend } from "@/lib/insights";
import { simulateGpa, GPA_SCALES } from "@/lib/grades/gpa-sim";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

const now = new Date("2026-11-09T15:00:00Z"); // Monday
const h = (n: number) => new Date(+now + n * 3_600_000).toISOString();
const mk = (o: Partial<Assignment>): Assignment => ({
  id: Math.random().toString(36).slice(2), user_id: "u", course_id: "c1", category_id: null, title: "HW", description: null, type: "homework", due_at: null,
  estimated_minutes: null, priority: "medium", status: "not_started", points_possible: null, is_extra_credit: false, source: "manual",
  canvas_assignment_id: null, external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", ...o,
});

describe("priority", () => {
  it("labels default estimates as defaults", () => {
    expect(estimateMinutes({ estimated_minutes: 90, type: "exam" })).toEqual({ minutes: 90, isDefault: false });
    expect(estimateMinutes({ estimated_minutes: null, type: "exam" })).toEqual({ minutes: 360, isDefault: true });
  });
  it("ranks overdue and imminent work above distant work, and explains why", () => {
    const ranked = rankAssignments([mk({ id: "far", due_at: h(24 * 20) }), mk({ id: "soon", due_at: h(10) }), mk({ id: "late", due_at: h(-5) }), mk({ id: "done", due_at: h(1), status: "completed" })], now);
    expect(ranked.map((r) => r.assignment.id)).toEqual(["late", "soon", "far"]);
    expect(ranked[0].reasons).toContain("Overdue");
  });
  it("accounts for exam type, category weight and the student's own priority", () => {
    const base = priorityScore(mk({ due_at: h(100) }), now).score;
    expect(priorityScore(mk({ due_at: h(100), type: "exam" }), now).score).toBeGreaterThan(base);
    expect(priorityScore(mk({ due_at: h(100) }), now, 40).score).toBeGreaterThan(base);
    expect(priorityScore(mk({ due_at: h(100), priority: "high" }), now).reasons).toContain("Marked high priority by you");
  });
});

describe("scheduling", () => {
  const dates = ["2026-11-09", "2026-11-10", "2026-11-11"];
  it("spreads weekly hours evenly or by weekday", () => {
    expect(availabilityFor(dates, 7, null)).toEqual([60, 60, 60]);
    expect(availabilityFor(dates, 0, [1, 2, 3, 0, 0, 0, 0])).toEqual([60, 120, 180]); // Mon, Tue, Wed
  });
  it("fills earliest days first and never schedules past a deadline", () => {
    const plan = planWeek([{ id: "a", title: "A", courseId: "c", minutes: 150, due: "2026-11-10T20:00:00Z", priority: 1 }], dates, [60, 60, 60], "UTC");
    expect(plan.days[0].blocks[0].minutes).toBe(60);
    expect(plan.days[1].blocks[0].minutes).toBe(60);
    expect(plan.days[2].blocks).toHaveLength(0);
    expect(plan.atRisk).toEqual([expect.objectContaining({ taskId: "a", shortfallMinutes: 30 })]);
  });
  it("puts earlier deadlines first and leaves later work unscheduled instead of at risk", () => {
    const plan = planWeek([
      { id: "late", title: "L", courseId: null, minutes: 60, due: "2026-11-30T00:00:00Z", priority: 1 },
      { id: "early", title: "E", courseId: null, minutes: 60, due: "2026-11-09T23:00:00Z", priority: 1 },
    ], dates, [60, 0, 0], "UTC");
    expect(plan.days[0].blocks.map((b) => b.taskId)).toEqual(["early"]);
    expect(plan.atRisk).toEqual([]);
    expect(plan.unscheduledMinutes).toBe(60);
  });
  it("puts overdue tasks on day one", () => {
    const plan = planWeek([{ id: "x", title: "X", courseId: null, minutes: 30, due: "2026-11-01T00:00:00Z", priority: 1 }], dates, [60, 60, 60], "UTC");
    expect(plan.days[0].blocks[0].taskId).toBe("x");
  });
  it("dayKey respects the timezone", () => {
    expect(dayKey(new Date("2026-11-10T03:00:00Z"), "America/Detroit")).toBe("2026-11-09");
  });
});

describe("workload", () => {
  it("buckets open work by week and describes it in plain words", () => {
    const rows = weeklyWorkload([
      mk({ type: "exam", due_at: h(48) }), mk({ type: "exam", due_at: h(60) }), mk({ due_at: h(50) }),
      mk({ due_at: h(24 * 8) }), mk({ due_at: h(24 * 8), status: "completed" }), mk({ type: "study", due_at: h(10) }),
    ], now, 3, "UTC");
    expect(rows[0]).toMatchObject({ exams: 2, others: 1, busy: true, label: "This week" });
    expect(rows[1]).toMatchObject({ others: 1, label: "Next week" });
    expect(describeWeek(rows[0])).toBe("You have 2 exams and 1 assignment due this week.");
    expect(describeWeek(rows[2])).toBeNull();
  });
});

const course = { id: "c1", name: "Opt", code: "IOE 310", grading_mode: "points", grade_scale: null, grade_curve: 0 } as unknown as Course;
const grade = (assignment_id: string, pts: number, day: number): AssignmentGrade & { graded_at: string } => ({ id: assignment_id, assignment_id, points_earned: pts, excused: false, graded_at: new Date(2026, 9, day).toISOString() });

describe("insights", () => {
  const asg = ["a", "b", "c", "d"].map((id) => mk({ id, points_possible: 100 }));
  it("builds a cumulative grade trend in graded order", () => {
    const t = gradeTrend(course, [], asg, [grade("b", 80, 5), grade("a", 100, 1), grade("c", 60, 9)], null);
    expect(t.map((p) => p.percent)).toEqual([100, 90, 80]);
  });
  it("flags only explainable risks and never calls a student failing", () => {
    const cats = [{ id: "k", course_id: "c1", name: "Final", weight: 40, drop_lowest: 0, sort_order: 0 }] as GradingCategoryRow[];
    const risks = courseRisks([course], cats, [
      ...asg, mk({ id: "ex", type: "exam", title: "Final", category_id: "k", due_at: h(24 * 5) }), mk({ id: "o1", due_at: h(-48), title: "P1" }), mk({ id: "o2", due_at: h(-24), title: "P2" }),
    ], [grade("a", 60, 1), grade("b", 55, 2), grade("c", 65, 3)] as never, null, now);
    const codes = risks[0].flags.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["overdue", "low_grade", "big_exam"]));
    expect(risks[0].flags.map((f) => f.text).join(" ")).not.toMatch(/fail/i);
  });
  it("does not flag a low grade from too little data", () => {
    const r = courseRisks([course], [], asg, [grade("a", 10, 1)] as never, null, now);
    expect(r[0].flags).toEqual([]);
  });
});

describe("GPA simulator", () => {
  it("computes semester and cumulative GPA on the Michigan scale", () => {
    const r = simulateGpa([{ id: "1", name: "A", credits: 4, letter: "A-" }, { id: "2", name: "B", credits: 3, letter: "B+" }], GPA_SCALES.umich.points, { gpa: 3.5, credits: 30 });
    expect(r.semesterGpa).toBeCloseTo((3.7 * 4 + 3.3 * 3) / 7, 8);
    expect(r.cumulativeGpa).toBeCloseTo((3.5 * 30 + 3.7 * 4 + 3.3 * 3) / 37, 8);
    expect(r.cumulativeCredits).toBe(37);
  });
  it("skips unusable courses and works without prior GPA", () => {
    const r = simulateGpa([{ id: "1", name: "X", credits: 0, letter: "A" }, { id: "2", name: "Y", credits: 3, letter: "P" }, { id: "3", name: "Z", credits: 3, letter: "A" }], GPA_SCALES.umich.points);
    expect(r.skipped).toEqual(["X", "Y"]);
    expect(r.semesterGpa).toBe(4);
    expect(r.cumulativeGpa).toBe(4);
    expect(simulateGpa([], GPA_SCALES.standard.points).semesterGpa).toBeNull();
  });
  it("supports custom scales", () => {
    expect(simulateGpa([{ id: "1", name: "A", credits: 2, letter: "P" }], { P: 4, N: 0 }).semesterGpa).toBe(4);
  });
});
