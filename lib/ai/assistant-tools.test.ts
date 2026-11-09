import { describe, expect, it } from "vitest";
import { executeTool, resolveCourse, TOOL_DECLARATIONS } from "./assistant-tools";
import { fixtureSnapshot } from "./fixture";

const s = fixtureSnapshot();
const call = (name: string, args: Record<string, unknown> = {}) => executeTool(name, args, s);
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("resolveCourse", () => {
  it("matches by code, loosely, and reports ambiguity or misses helpfully", () => {
    expect("course" in resolveCourse(s, "ioe310")).toBe(true);
    expect("course" in resolveCourse(s, "IOE 310")).toBe(true);
    expect(resolveCourse(s, "chem")).toEqual({ error: expect.stringContaining("No course matches") });
    expect(resolveCourse(s, "")).toEqual({ error: expect.stringContaining("Which course?") });
    expect("course" in resolveCourse({ ...s, focusCourseId: "c280" }, undefined)).toBe(true);
  });
});

describe("assistant tools use the real engines", () => {
  it("get_course_grade returns the engine's number and category weights", () => {
    const r = call("get_course_grade", { course: "IOE 310" }).result as R;
    // HW: drop lowest (72) -> (95+88)/200 = 91.5; Quiz 85; Mid 84 -> (20*91.5+10*85+40*84)/70
    expect(r.percent).toBeCloseTo((20 * 91.5 + 10 * 85 + 40 * 84) / 70, 1);
    expect(r.categories.find((c: R) => c.name === "Homework")).toMatchObject({ weight_percent: 20, dropped: 1 });
    expect(r.kind).toMatch(/graded work only/);
  });
  it("grade_needed solves for the final using the engine", () => {
    const r = call("grade_needed", { course: "IOE 310", target: "A", assignment: "Final" }).result as R;
    expect(r.target).toBe("A (93%)");
    expect(r.required_percent).toBeGreaterThan(90);
    expect(r.assumptions.length).toBeGreaterThan(0);
  });
  it("what_if never mutates data and labels the result hypothetical", () => {
    const r = call("what_if", { course: "IOE 310", scores: [{ assignment: "Final", percent: 95 }] }).result as R;
    expect(r.kind).toMatch(/hypothetical/);
    expect(r.hypothetical_percent).toBeGreaterThan(r.current_percent);
    expect(s.grades.some((g) => g.assignment_id === "fin")).toBe(false);
  });
});

describe("list_assignments", () => {
  it("returns open work sorted by date, formatted in the student's timezone", () => {
    const r = call("list_assignments", { days_ahead: 7 }).result as R;
    expect(r.assignments.map((a: R) => a.id)).toEqual(["h4", "p3"]);
    expect(r.assignments[0].due).toMatch(/Tue, Nov 10/);
  });
  it("finds a specific exam by title and filters by course", () => {
    const r = call("list_assignments", { course: "IOE 310", title_contains: "final" }).result as R;
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0].title).toBe("Final Exam");
  });
  it("reports overdue items and cites assignments", () => {
    const out = call("list_assignments", { status: "overdue" });
    expect((out.result as R).assignments.map((a: R) => a.title)).toEqual(["Lab 5"]);
    expect(out.citations[0].href).toContain("/courses/c280");
  });
});

describe("get_course_info", () => {
  it("returns staff with roles, emails and office hours", () => {
    const r = call("get_course_info", { course: "IOE 310", topic: "people" }).result as R;
    expect(r.people.map((p: R) => `${p.name}:${p.role}`)).toEqual(["Dr. Maria Rivera:Instructor", "Sam Lee:Graduate TA (GSI)", "Pat Kim:Instructional assistant"]);
    expect(r.people[1]).toMatchObject({ email: "samlee@example.edu", office_hours: "Thu 4-5pm", title: "GSI" });
    expect(r.meetings).toBeUndefined();
  });
  it("returns class times in a readable form, contacts, links and the outline", () => {
    const t = call("get_course_info", { course: "IOE 310", topic: "times" }).result as R;
    expect(t.meetings[0]).toMatchObject({ kind: "lecture", when: "Mon/Wed · 10:30 AM – 12 PM", location: "1571 GGBL" });
    const all = call("get_course_info", { course: "IOE 310" }).result as R;
    expect(all.contacts.map((c: R) => c.label)).toContain("Ed Discussion");
    expect(all.links[0].url).toContain("gradescope");
    expect(all.outline[0].module).toMatch(/Week 1/);
    expect(all.key_info[0].value).toBe("MATH 215");
  });
  it("says plainly when nothing has been read yet, and still offers what the course itself has", () => {
    const out = call("get_course_info", { course: "EECS 280" });
    expect((out.result as R).note).toMatch(/No course info/);
    expect((out.result as R).instructor_on_course).toBe("Dr. Demo"); // what the course itself already has
    expect(out.citations[0].href).toContain("tab=info");
  });
});

describe("other tools", () => {
  it("get_syllabus returns stored policies and flags missing syllabi", () => {
    expect((call("get_syllabus", { course: "IOE 310", section: "policies" }).result as R).policies.late_submission).toMatch(/10%/);
    expect((call("get_syllabus", { course: "EECS 280" }).result as R).error).toMatch(/No syllabus/);
  });
  it("workload and prioritize are grounded in data", () => {
    const w = call("workload", { weeks: 2 }).result as R;
    expect(w.weeks[0].summary).toBeTruthy();
    const p = call("prioritize").result as R;
    expect(p.ranked[0].title).toBe("Lab 5"); // overdue ranks first
    expect(p.ranked[0].why).toContain("Overdue");
  });
  it("recent_changes shows Canvas additions and deadline changes", () => {
    const r = call("recent_changes").result as R;
    expect(r.new_canvas_assignments[0].title).toBe("Homework 4");
    expect(r.changes[0]).toMatchObject({ assignment: "Homework 4", field: "due_at" });
  });
  it("unknown tools fail safely; every declared tool is implemented", () => {
    expect((call("drop_tables").result as R).error).toMatch(/Unknown/);
    for (const d of TOOL_DECLARATIONS) expect((call(d.name, d.name === "grade_needed" ? { target: "A" } : d.name === "what_if" ? { scores: [] } : {}).result as R)?.error ?? "").not.toMatch(/Unknown tool/);
  });
});
