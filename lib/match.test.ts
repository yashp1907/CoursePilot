import { describe, expect, it } from "vitest";
import { categoryNamesMatch, coveredByItems, isRecurringPlaceholder, kindOf, matchOneToOne, matchScore, numberOf, stem } from "./match";

const m = (a: string, b: string, extra: { ta?: string; tb?: string; da?: string; db?: string } = {}) =>
  matchScore({ title: a, type: extra.ta, due_at: extra.da }, { title: b, type: extra.tb, due_at: extra.db }).score;

describe("kindOf / numberOf", () => {
  it("recognizes kinds across wording styles", () => {
    expect(kindOf("HW4")).toBe("homework");
    expect(kindOf("Problem Set 3")).toBe("homework");
    expect(kindOf("Mid-term Exam")).toBe("midterm");
    expect(kindOf("Final Exam")).toBe("final");
    expect(kindOf("Final Project")).toBe("project");
    expect(kindOf("Quizzes")).toBe("quiz");
    expect(kindOf("Reading response", "homework")).toBe("reading");
    expect(kindOf("Week 3 worksheet")).toBe("homework");
    expect(kindOf("Something", "exam")).toBe("exam"); // falls back to type
    expect(kindOf("Something")).toBeNull();
  });
  it("extracts sequence numbers, ignoring dates, chapters, weeks, years and points", () => {
    expect(numberOf("Homework 04")).toBe(4);
    expect(numberOf("hw#7")).toBe(7);
    expect(numberOf("Quiz two")).toBe(2);
    expect(numberOf("First midterm")).toBe(1);
    expect(numberOf("Quiz: Chapters 3-4")).toBeNull();
    expect(numberOf("Quiz 2: Chapters 3-4")).toBe(2);
    expect(numberOf("Project due 10/15")).toBeNull();
    expect(numberOf("Week 5 Reading")).toBeNull();
    expect(numberOf("Homework 3 (20 points) Fall 2026")).toBe(3);
    expect(numberOf("Final Exam")).toBeNull();
  });
  it("stems plurals", () => { expect(stem("quizzes")).toBe("quiz"); expect(stem("exams")).toBe("exam"); expect(stem("boxes")).toBe("box"); expect(stem("class")).toBe("class"); });
});

describe("matchScore: same thing, different words", () => {
  it.each([
    ["Homework 4", "HW 4"], ["Homework 4", "hw4"], ["Homework 4", "Homework 04"], ["Homework 4", "Problem Set 4"], ["HW #4", "Homework 4: Linear Programming"],
    ["Quiz 2", "Quiz 2: Chapters 3-4"], ["Lab 3", "Lab 3: Acceptance Sampling"], ["Midterm Exam", "Midterm 1"], ["Midterm", "Midterm Exam"],
    ["Exam 1", "Midterm 1"], ["Final", "Final Exam"], ["Final Exam", "Final Examination"], ["Project 2", "Project 2 - Text Classifier"], ["Project Proposal", "Project Proposal"],
  ])("%s ~ %s", (a, b) => { expect(m(a, b)).toBeGreaterThanOrEqual(0.8); });
});

describe("matchScore: different things stay different", () => {
  it.each([
    ["Homework 4", "Homework 5"], ["Quiz 1", "Quiz 2"], ["Homework 1", "Quiz 1"], ["Midterm Exam", "Final Exam"], ["Lab 2", "Lab 3"],
    ["Project 1", "Project 2"], ["Midterm 1", "Midterm 2"], ["Homework 4", "Study for homework 4 exam"], ["Reading", "Homework"],
  ])("%s !~ %s", (a, b) => { expect(m(a, b)).toBeLessThan(0.8); });
  it("does not match two unrelated untyped titles", () => { expect(m("Team meeting", "Office hours")).toBeLessThan(0.8); });
  it("different kinds never match even with identical numbers", () => { expect(m("Exam 1", "Quiz 1")).toBe(0); });
});

describe("dates and ties", () => {
  it("nudges matches with close dates and penalizes far-apart ones", () => {
    const close = m("Midterm Exam", "Midterm 1", { da: "2026-10-15T22:00:00Z", db: "2026-10-15T23:00:00Z" });
    const far = m("Midterm Exam", "Midterm 1", { da: "2026-03-01T00:00:00Z", db: "2026-10-15T23:00:00Z" });
    expect(close).toBeGreaterThan(far);
  });
  it("a one-per-course midterm/final matches even when the syllabus date was far off", () => {
    expect(m("Midterm", "Midterm Exam", { da: "2026-10-15T22:00:00Z", db: "2026-12-01T15:00:00Z" })).toBeGreaterThanOrEqual(0.8);
    expect(m("Final", "Final Examination", { da: "2026-12-01T00:00:00Z", db: "2027-01-30T00:00:00Z" })).toBeGreaterThanOrEqual(0.8);
  });
  it("but unnumbered look-alikes with far-apart dates still don't match (e.g. two different 'Project Proposal's)", () => {
    expect(m("Project Proposal", "Proposal for project", { da: "2026-01-10T00:00:00Z", db: "2026-11-10T00:00:00Z" })).toBeLessThan(0.8);
  });
  it("syllabus tentative dates don't block a strong match (kind + number)", () => {
    expect(m("Homework 4", "Homework 4", { da: "2026-10-01T00:00:00Z", db: "2026-10-20T00:00:00Z" })).toBeGreaterThanOrEqual(0.8);
  });
});

describe("matchOneToOne", () => {
  const local = [{ title: "Homework 4" }, { title: "Homework 5" }, { title: "Midterm" }, { title: "Study session" }];
  const canvas = [{ title: "HW 5" }, { title: "HW 4" }, { title: "Midterm Exam 1" }, { title: "Quiz 9" }];
  it("pairs each item with its right partner, only once", () => {
    const r = matchOneToOne(canvas, local);
    expect(r.get(0)?.index).toBe(1); // HW 5 <- Homework 5
    expect(r.get(1)?.index).toBe(0); // HW 4 <- Homework 4
    expect(r.get(2)?.index).toBe(2); // Midterm Exam 1 <- Midterm
    expect(r.has(3)).toBe(false);    // Quiz 9 has no partner
  });
  it("never reuses a pool item", () => {
    const r = matchOneToOne([{ title: "Homework 4" }, { title: "Homework 4" }], [{ title: "HW 4" }]);
    expect(r.size).toBe(1);
  });
  it("uses dates to break ties between look-alikes, and refuses true ambiguity", () => {
    const pool = [{ title: "Quiz", due_at: "2026-10-01T12:00:00Z" }, { title: "Quiz", due_at: "2026-10-20T12:00:00Z" }];
    expect(matchOneToOne([{ title: "Quiz", due_at: "2026-10-19T12:00:00Z" }], pool).get(0)?.index).toBe(1);
    expect(matchOneToOne([{ title: "Quiz" }], [{ title: "Quiz" }, { title: "Quiz" }]).size).toBe(0);
  });
  it("respects a stricter threshold per pool item (manual items)", () => {
    const r = matchOneToOne([{ title: "Project Proposal" }], [{ title: "Project proposal draft" }], () => 0.9);
    expect(r.size).toBe(0);
  });
});

describe("recurring placeholders", () => {
  it("detects patterns instead of items", () => {
    expect(isRecurringPlaceholder({ title: "Weekly quizzes" })).toBe(true);
    expect(isRecurringPlaceholder({ title: "Homework", description: "Recurring: weekly" })).toBe(true);
    expect(isRecurringPlaceholder({ title: "Quiz 3", due_at: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(isRecurringPlaceholder({ title: "Weekly quiz 3" })).toBe(false);
  });
  it("is covered once Canvas has 2+ items of that kind", () => {
    const canvas = [{ title: "Quiz 1" }, { title: "Quiz 2" }, { title: "Homework 1" }];
    expect(coveredByItems({ title: "Weekly quizzes" }, canvas)).toBe(true);
    expect(coveredByItems({ title: "Weekly labs" }, canvas)).toBe(false);
    expect(coveredByItems({ title: "Weekly quizzes" }, [{ title: "Quiz 1" }])).toBe(false);
  });
});

describe("categoryNamesMatch", () => {
  it.each([["Homework", "Homework Assignments"], ["Quizzes", "Quiz"], ["Exams", "Exam"], ["Homework", "Assignments"], ["Labs", "Lab"], ["Problem Sets", "Problem Set"]])("%s ~ %s", (a, b) => expect(categoryNamesMatch(a, b)).toBe(true));
  it.each([["Midterm", "Final Exam"], ["Homework", "Labs"], ["Quizzes", "Exams"], ["", "Homework"]])("%s !~ %s", (a, b) => expect(categoryNamesMatch(a, b)).toBe(false));
});
