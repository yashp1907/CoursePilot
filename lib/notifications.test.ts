import { describe, expect, it } from "vitest";
import { generateNotifications } from "./notifications";
import type { Assignment, Course } from "@/types/database";

const now = new Date("2026-11-07T12:00:00Z");
const at = (h: number) => new Date(+now + h * 3_600_000).toISOString();
const mk = (o: Partial<Assignment>): Assignment => ({
  id: Math.random().toString(36).slice(2), user_id: "u", course_id: "c1", category_id: null, title: "HW", description: null, type: "homework", due_at: null,
  estimated_minutes: null, priority: "medium", status: "not_started", points_possible: null, is_extra_credit: false, source: "manual",
  canvas_assignment_id: null, external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", ...o,
});
const courses = [{ id: "c1", name: "Optimization", code: "IOE 310" } as Course];
const prefs = { notify_deadlines: true, notify_overdue: true, notify_exams: true, deadline_lead_hours: 24 };

describe("generateNotifications", () => {
  it("reminds only within the lead window, only for open work", () => {
    const n = generateNotifications(now, [mk({ due_at: at(10) }), mk({ due_at: at(30) }), mk({ due_at: at(5), status: "completed" })], courses, prefs);
    expect(n.filter((x) => x.kind === "deadline_soon")).toHaveLength(1);
    expect(n[0].body).toContain("IOE 310 HW");
  });
  it("is stable: same inputs give the same dedupe keys", () => {
    const list = [mk({ id: "a", due_at: at(10) })];
    expect(generateNotifications(now, list, courses, prefs).map((x) => x.dedupe_key)).toEqual(generateNotifications(now, list, courses, prefs).map((x) => x.dedupe_key));
  });
  it("caps noise and summarizes the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) => mk({ due_at: at(i + 1) }));
    const n = generateNotifications(now, many, courses, prefs);
    expect(n.filter((x) => x.kind === "deadline_soon")).toHaveLength(4); // 3 + one summary
  });
  it("flags recent overdue work but not ancient or completed work", () => {
    const n = generateNotifications(now, [mk({ due_at: at(-5) }), mk({ due_at: at(-24 * 30) }), mk({ due_at: at(-5), status: "submitted" })], courses, prefs);
    expect(n.filter((x) => x.kind === "overdue")).toHaveLength(1);
  });
  it("warns about exams within 7 days", () => {
    const n = generateNotifications(now, [mk({ type: "exam", due_at: at(72), title: "Midterm" }), mk({ type: "exam", due_at: at(24 * 20) })], courses, prefs);
    expect(n.filter((x) => x.kind === "exam_soon")).toEqual([expect.objectContaining({ title: "Exam in 3 days" })]);
  });
  it("respects preferences and ignores demo data", () => {
    const list = [mk({ due_at: at(5) }), mk({ due_at: at(-5) }), mk({ type: "exam", due_at: at(48) }), mk({ due_at: at(3), is_demo: true })];
    expect(generateNotifications(now, list, courses, { ...prefs, notify_deadlines: false, notify_overdue: false, notify_exams: false })).toEqual([]);
    expect(generateNotifications(now, [mk({ due_at: at(3), is_demo: true })], courses, prefs)).toEqual([]);
  });
});
