import { describe, expect, it } from "vitest";
import { planAssignmentSync } from "./canvas/plan";
import { mapAssignment } from "./canvas/map";
import { planSyllabusImport, type SyllabusItem } from "./syllabus-plan";
import { findDuplicatePairs, mergePatch } from "./duplicates";
import type { Assignment } from "@/types/database";

let n = 0;
const base = (o: Partial<Assignment>): Assignment => ({
  id: `L${++n}`, user_id: "u", course_id: "c", category_id: null, title: "x", description: null, type: "homework", due_at: null, estimated_minutes: null,
  priority: "medium", status: "not_started", points_possible: null, is_extra_credit: false, source: "manual", canvas_assignment_id: null,
  external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", ...o,
});

// What a student's real course looks like in each source (different wording, tentative vs real dates).
const SYLLABUS: SyllabusItem[] = [
  { title: "Midterm Exam", type: "exam", due_at: "2026-10-15T22:00:00.000Z", points: null, category: "Midterm", recurrence: null },
  { title: "Final Exam", type: "exam", due_at: "2026-12-14T13:00:00.000Z", points: null, category: "Final Exam", recurrence: null },
  { title: "Project proposal", type: "project", due_at: "2026-10-01T03:59:00.000Z", points: null, category: null, recurrence: null },
  { title: "Weekly quizzes", type: "quiz", due_at: null, points: null, category: "Quizzes", recurrence: "weekly" },
  { title: "Homework", type: "homework", due_at: null, points: null, category: "Homework", recurrence: "weekly, posted on Canvas" },
];
const canvasRaw = [
  { id: 1, name: "Midterm Exam 1", due_at: "2026-10-16T22:00:00Z", points_possible: 100, assignment_group_id: 9 },
  { id: 2, name: "Final Examination", due_at: "2026-12-15T13:00:00Z", points_possible: 200, assignment_group_id: 9 },
  { id: 3, name: "Project Proposal", due_at: "2026-10-02T03:59:00Z", points_possible: 30, assignment_group_id: 8 },
  { id: 4, name: "Quiz 1", due_at: "2026-09-10T03:59:00Z", points_possible: 10, assignment_group_id: 7 },
  { id: 5, name: "Quiz 2", due_at: "2026-09-17T03:59:00Z", points_possible: 10, assignment_group_id: 7 },
  { id: 6, name: "HW 1", due_at: "2026-09-12T03:59:00Z", points_possible: 100, assignment_group_id: 6 },
  { id: 7, name: "HW 2", due_at: "2026-09-19T03:59:00Z", points_possible: 100, assignment_group_id: 6 },
];
const canvas = canvasRaw.map((a) => mapAssignment(a)!);

/** Apply a Canvas sync plan to an in-memory assignment list (what sync.ts does against the database). */
function applyCanvas(list: Assignment[]): Assignment[] {
  const plan = planAssignmentSync({ existing: list, incoming: canvas, courseId: "c", courseLabel: "IOE 310", timeZone: "UTC" });
  const out = list.map((a) => {
    const link = plan.links.find((l) => l.id === a.id), upd = plan.updates.find((u) => u.id === a.id);
    return link ? ({ ...a, ...link.patch } as Assignment) : upd ? ({ ...a, ...upd.patch } as Assignment) : a;
  });
  for (const i of plan.inserts) out.push(base({ title: i.title, type: i.type, due_at: i.due_at, points_possible: i.points_possible, source: "canvas", canvas_assignment_id: i.canvas_assignment_id }));
  return out;
}
function applySyllabus(list: Assignment[]): Assignment[] {
  const plan = planSyllabusImport(list, SYLLABUS, SYLLABUS.map((_, i) => i));
  const out = list.map((a) => { const e = plan.enrich.find((x) => x.id === a.id); return e ? ({ ...a, ...e.patch } as Assignment) : a; });
  for (const { item } of plan.inserts) out.push(base({ title: item.title, type: item.type, due_at: item.due_at, points_possible: item.points, source: "syllabus", description: item.recurrence ? `Recurring: ${item.recurrence}` : null }));
  return out;
}
const titles = (l: Assignment[]) => l.map((a) => a.title).sort();

describe("syllabus and Canvas never overlap", () => {
  it("Canvas first, then syllabus: the syllabus adds nothing Canvas already has", () => {
    const afterCanvas = applyCanvas([]);
    expect(afterCanvas).toHaveLength(7);
    const afterBoth = applySyllabus(afterCanvas);
    expect(afterBoth).toHaveLength(7); // midterm/final/proposal matched; recurring placeholders covered by Canvas items
    expect(findDuplicatePairs(afterBoth)).toEqual([]);
  });

  it("syllabus first, then Canvas: Canvas adopts the syllabus items instead of duplicating them", () => {
    const afterSyllabus = applySyllabus([]);
    expect(afterSyllabus).toHaveLength(5);
    const afterBoth = applyCanvas(afterSyllabus);
    // 7 real assignments + the two recurring placeholders (which Canvas can't "adopt" since they aren't single items)
    expect(afterBoth.filter((a) => !/^Recurring:/.test(a.description ?? ""))).toHaveLength(7);
    const midterm = afterBoth.find((a) => a.canvas_assignment_id === "1")!;
    expect(midterm.id).toBe(afterSyllabus[0].id);          // the same row was adopted
    expect(midterm.source).toBe("canvas");                  // Canvas is now authoritative
    expect(midterm.due_at).toBe("2026-10-16T22:00:00.000Z"); // real Canvas date replaced the tentative one
    expect(afterBoth.filter((a) => a.type === "exam")).toHaveLength(2);
    // the leftover recurring placeholders are flagged as covered, and merging removes them
    const pairs = findDuplicatePairs(afterBoth);
    expect(pairs.map((p) => p.kind).sort()).toEqual(["covered", "covered"]);
  });

  it("is idempotent: repeating either import changes nothing", () => {
    let list = applySyllabus(applyCanvas([]));
    const snapshot = JSON.stringify(titles(list));
    for (let i = 0; i < 3; i++) list = applySyllabus(applyCanvas(list));
    expect(JSON.stringify(titles(list))).toBe(snapshot);
    list = applyCanvas(applySyllabus(applyCanvas([])));
    expect(list).toHaveLength(7);
  });

  it("fills a date the syllabus knows when Canvas left it blank, without a later sync erasing it", () => {
    let list = applyCanvas([]);
    list = list.map((a) => (a.canvas_assignment_id === "1" ? { ...a, due_at: null } : a));
    list = applySyllabus(list);
    expect(list.find((a) => a.canvas_assignment_id === "1")!.due_at).toBe("2026-10-15T22:00:00.000Z");
    const again = planAssignmentSync({ existing: list, incoming: [mapAssignment({ id: 1, name: "Midterm Exam 1", due_at: null, points_possible: 100 })!], courseId: "c", courseLabel: "X", timeZone: "UTC" });
    expect(again.updates.find((u) => u.patch.due_at !== undefined)).toBeUndefined(); // Canvas "no date" never blanks it
  });

  it("keeps different assignments separate (HW 1 vs HW 2, Quiz 1 vs Quiz 2)", () => {
    const mine = base({ title: "Homework 2", source: "syllabus", points_possible: 100 });
    const list = applyCanvas([mine]);
    expect(list.find((a) => a.id === mine.id)!.canvas_assignment_id).toBe("7"); // adopted by HW 2 (not HW 1), and now carries Canvas's title
    expect(list.find((a) => a.id === mine.id)!.title).toBe("HW 2");
    expect(list).toHaveLength(7);                                              // no extra row for HW 2
    expect(list.filter((a) => a.canvas_assignment_id)).toHaveLength(7);
  });
});

describe("Canvas linking rules", () => {
  it("never adopts a personal study task, or a different numbered item", () => {
    const list = applyCanvas([base({ title: "Study for Midterm Exam", type: "study" }), base({ title: "Homework 3", source: "syllabus" })]);
    expect(list.find((a) => a.title === "Study for Midterm Exam")!.canvas_assignment_id).toBeNull();
    expect(list.find((a) => a.title === "Homework 3")!.canvas_assignment_id).toBeNull(); // Canvas has HW 1 and 2 only
  });
  it("a manual item keeps the student's own values and reports conflicts", () => {
    const plan = planAssignmentSync({ existing: [base({ title: "Project Proposal", source: "manual", due_at: "2026-09-30T00:00:00.000Z" })], incoming: canvas.slice(2, 3), courseId: "c", courseLabel: "X", timeZone: "UTC" });
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0].patch.due_at).toBeUndefined();
    expect(plan.links[0].patch.source).toBeUndefined();
    expect(plan.links[0].conflicts.some((c) => c.field === "due_at")).toBe(true);
  });
  it("won't adopt a loosely-worded manual item (needs near-certain match)", () => {
    const plan = planAssignmentSync({ existing: [base({ title: "Project proposal draft", source: "manual" })], incoming: canvas.slice(2, 3), courseId: "c", courseLabel: "X", timeZone: "UTC" });
    expect(plan.links).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
  });
  it("a linked syllabus item keeps its category, notes and priority, and never changes type", () => {
    const plan = planAssignmentSync({ existing: [base({ title: "Midterm Exam", type: "exam", source: "syllabus", category_id: "cat", description: "my notes", priority: "high" })], incoming: canvas.slice(0, 1), courseId: "c", courseLabel: "X", timeZone: "UTC" });
    const patch = plan.links[0].patch;
    expect(patch.category_id).toBeUndefined();
    expect(patch.description).toBeUndefined();
    expect(patch.priority).toBeUndefined();
    expect(patch.type).toBeUndefined();
    expect(patch.canvas_assignment_id).toBe("1");
    expect(plan.notifications.some((n) => n.kind === "deadline_changed")).toBe(false); // a tentative syllabus date becoming real isn't a "change"
  });
  it("records a history entry for every link", () => {
    const plan = planAssignmentSync({ existing: [base({ title: "Midterm", type: "exam", source: "syllabus" })], incoming: canvas.slice(0, 1), courseId: "c", courseLabel: "X", timeZone: "UTC" });
    expect(plan.links[0].history[0].field).toBe("canvas_link");
  });
});

describe("planSyllabusImport", () => {
  const canvasLocal = canvasRaw.map((a) => { const m = mapAssignment(a)!; return base({ title: m.title, type: m.type, due_at: m.due_at, points_possible: m.points_possible, source: "canvas", canvas_assignment_id: m.canvas_assignment_id }); });
  it("explains why each syllabus item was skipped", () => {
    const plan = planSyllabusImport(canvasLocal, SYLLABUS, SYLLABUS.map((_, i) => i));
    expect(plan.inserts).toHaveLength(0);
    const reasons = Object.fromEntries(plan.skipped.map((s) => [s.title, s.reason]));
    expect(reasons["Midterm Exam"]).toBe("in_canvas");
    expect(reasons["Weekly quizzes"]).toBe("covered_by_canvas");
    expect(reasons["Homework"]).toBe("covered_by_canvas");
  });
  it("collapses the same exam listed twice within the syllabus", () => {
    const items: SyllabusItem[] = [SYLLABUS[0], { ...SYLLABUS[0], title: "Midterm" }];
    const plan = planSyllabusImport([], items, [0, 1]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("duplicate_in_syllabus");
  });
  it("only considers the items the student selected", () => {
    expect(planSyllabusImport([], SYLLABUS, [1]).inserts.map((i) => i.item.title)).toEqual(["Final Exam"]);
  });
  it("keeps a recurring placeholder when Canvas doesn't cover it", () => {
    const plan = planSyllabusImport([], [SYLLABUS[3]], [0]);
    expect(plan.inserts).toHaveLength(1);
  });
  it("matches manual items only on near-certain matches", () => {
    const manual = [base({ title: "Final Exam", type: "exam", source: "manual" })];
    expect(planSyllabusImport(manual, [SYLLABUS[1]], [0]).skipped[0].reason).toBe("already_added");
  });
});

describe("duplicate finder + merge", () => {
  it("finds pre-existing overlaps (older imports) and never pairs two Canvas items", () => {
    const list = [
      base({ title: "Midterm", type: "exam", source: "syllabus" }), base({ title: "Midterm Exam 1", type: "exam", source: "canvas", canvas_assignment_id: "1" }),
      base({ title: "Quiz 1", type: "quiz", source: "canvas", canvas_assignment_id: "4" }), base({ title: "Quiz 2", type: "quiz", source: "canvas", canvas_assignment_id: "5" }),
    ];
    const pairs = findDuplicatePairs(list);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keep.canvas_assignment_id).toBe("1");
    expect(pairs[0].drop.source).toBe("syllabus");
  });
  it("respects dismissed pairs and ignores demo data and study tasks", () => {
    const a = base({ title: "Midterm", type: "exam", source: "syllabus" }), b = base({ title: "Midterm Exam", type: "exam", source: "canvas", canvas_assignment_id: "1" });
    const [p] = findDuplicatePairs([a, b]);
    expect(findDuplicatePairs([a, b], new Set([p.key]))).toEqual([]);
    expect(findDuplicatePairs([{ ...a, is_demo: true }, b])).toEqual([]);
    expect(findDuplicatePairs([{ ...a, type: "study", title: "Study for midterm" }, b])).toEqual([]);
  });
  it("merge only fills gaps and carries over progress and grades", () => {
    const keep = base({ title: "HW 4", source: "canvas", canvas_assignment_id: "4" });
    const drop = base({ title: "Homework 4", source: "syllabus", category_id: "cat", description: "notes", estimated_minutes: 90, priority: "high", status: "in_progress" });
    const { patch, moveGrade } = mergePatch(keep, drop, null, { points_earned: 90, excused: false });
    expect(patch).toMatchObject({ category_id: "cat", description: "notes", estimated_minutes: 90, priority: "high", status: "in_progress" });
    expect(moveGrade).toBe(true);
    const kept = mergePatch(base({ category_id: "mine", description: "x", estimated_minutes: 30, priority: "low", status: "completed", canvas_assignment_id: "1" }), drop, { points_earned: 80, excused: false }, { points_earned: 90, excused: false });
    expect(kept.patch).toEqual({});
    expect(kept.moveGrade).toBe(false);
  });
});
