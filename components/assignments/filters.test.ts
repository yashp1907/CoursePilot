import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, filterAssignments, sortAssignments } from "./filters";
import type { Assignment, Course } from "@/types/database";

const mk = (o: Partial<Assignment>): Assignment => ({
  id: "x", user_id: "u", course_id: "c1", category_id: null, title: "T", description: null, type: "homework", due_at: null,
  estimated_minutes: null, priority: "medium", status: "not_started", points_possible: null, is_extra_credit: false,
  source: "manual", canvas_assignment_id: null, external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", ...o,
});
const now = new Date("2026-11-07T12:00:00Z");
const list = [
  mk({ id: "a", title: "A", due_at: "2026-11-05T12:00:00Z" }),                      // overdue
  mk({ id: "b", title: "B", due_at: "2026-11-10T12:00:00Z", priority: "high" }),
  mk({ id: "c", title: "C", due_at: "2026-11-12T12:00:00Z", status: "completed", course_id: "c2" }),
  mk({ id: "d", title: "D", due_at: null }),
];

describe("assignment filters", () => {
  it("derives overdue status for filtering", () => {
    expect(filterAssignments(list, { ...EMPTY_FILTERS, status: "overdue" }, now).map((a) => a.id)).toEqual(["a"]);
  });
  it("completed items are never overdue", () => {
    expect(filterAssignments(list, { ...EMPTY_FILTERS, status: "completed" }, now).map((a) => a.id)).toEqual(["c"]);
  });
  it("filters by course, priority, and search", () => {
    expect(filterAssignments(list, { ...EMPTY_FILTERS, course: "c2" }, now).map((a) => a.id)).toEqual(["c"]);
    expect(filterAssignments(list, { ...EMPTY_FILTERS, priority: "high" }, now).map((a) => a.id)).toEqual(["b"]);
    expect(filterAssignments(list, { ...EMPTY_FILTERS, q: "d" }, now).map((a) => a.id)).toEqual(["d"]);
  });
  it("date range excludes undated items", () => {
    expect(filterAssignments(list, { ...EMPTY_FILTERS, from: "2026-11-09", to: "2026-11-11" }, now).map((a) => a.id)).toEqual(["b"]);
  });
  it("sorts by due date with undated last, and reverses", () => {
    const courses = [] as Course[];
    expect(sortAssignments(list, "due", 1, courses).map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortAssignments(list, "priority", 1, courses)[0].id).toBe("b");
  });
});
