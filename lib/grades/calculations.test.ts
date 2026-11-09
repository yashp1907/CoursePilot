import { describe, expect, it } from "vitest";
import {
  applyScenario, bucketStats, computeGrade, gradeRange, letterForPercent, projectGrade, remainingItems, requiredScore, validateScheme,
} from "./calculations";
import { STANDARD_SCALE } from "./scales";
import type { GradeItem, GradingScheme } from "./types";

const cats = [
  { id: "hw", name: "Homework", weight: 20, dropLowest: 0 },
  { id: "qz", name: "Quizzes", weight: 10, dropLowest: 0 },
  { id: "mt", name: "Midterms", weight: 40, dropLowest: 0 },
  { id: "fn", name: "Final", weight: 30, dropLowest: 0 },
];
const weighted: GradingScheme = { mode: "weighted", categories: cats, scale: STANDARD_SCALE, curve: 0 };
const item = (id: string, categoryId: string | null, earned: number | null, possible = 100, extra: Partial<GradeItem> = {}): GradeItem => ({
  id, categoryId, name: id, earned, possible, ...extra,
});

describe("letterForPercent", () => {
  it("maps boundaries inclusively", () => {
    expect(letterForPercent(93)).toBe("A");
    expect(letterForPercent(92.99)).toBe("A-");
    expect(letterForPercent(59.9)).toBe("F");
    expect(letterForPercent(null)).toBeNull();
  });
  it("supports custom scales", () => {
    expect(letterForPercent(95, [{ letter: "P", min: 50 }, { letter: "NP", min: 0 }])).toBe("P");
  });
});

describe("bucketStats", () => {
  it("ignores ungraded items instead of treating them as zero", () => {
    const s = bucketStats([item("a", "hw", 90), item("b", "hw", null)]);
    expect(s.percent).toBe(90);
    expect(s.gradedCount).toBe(1);
    expect(s.totalCount).toBe(2);
  });
  it("drops the lowest by percent, not by points", () => {
    const s = bucketStats([item("a", "hw", 5, 10), item("b", "hw", 90, 100), item("c", "hw", 80, 100)], 1);
    expect(s.droppedIds).toEqual(["a"]);
    expect(s.percent).toBe(85);
  });
  it("never drops the only graded item", () => {
    const s = bucketStats([item("a", "hw", 50)], 3);
    expect(s.droppedIds).toEqual([]);
    expect(s.percent).toBe(50);
  });
  it("adds extra credit to earned but not possible", () => {
    const s = bucketStats([item("a", "hw", 90), item("x", "hw", 5, 5, { extraCredit: true })]);
    expect(s.earned).toBe(95);
    expect(s.possible).toBe(100);
    expect(s.percent).toBe(95);
  });
  it("treats zero-possible items as extra credit and skips excused", () => {
    const s = bucketStats([item("a", "hw", 80), item("z", "hw", 2, 0), item("e", "hw", 0, 100, { excused: true })]);
    expect(s.percent).toBe(82);
    expect(s.totalCount).toBe(2);
  });
  it("returns null percent for an empty bucket", () => {
    expect(bucketStats([]).percent).toBeNull();
  });
});

describe("computeGrade: weighted", () => {
  it("computes a straightforward weighted average", () => {
    const g = computeGrade(weighted, [item("h1", "hw", 100), item("q1", "qz", 80), item("m1", "mt", 90), item("f", "fn", 70)]);
    // .2*100 + .1*80 + .4*90 + .3*70 = 20+8+36+21 = 85
    expect(g.percent).toBeCloseTo(85, 8);
    expect(g.letter).toBe("B");
    expect(g.kind).toBe("current");
  });
  it("renormalizes over graded categories (no implicit zeros)", () => {
    const g = computeGrade(weighted, [item("h1", "hw", 90), item("m1", "mt", 80)]);
    // (20*90 + 40*80) / 60 = 83.333
    expect(g.percent).toBeCloseTo(83.3333333, 5);
    expect(g.gradedWeight).toBe(60);
  });
  it("averages within a category by points, then weights", () => {
    const g = computeGrade(weighted, [item("h1", "hw", 10, 10), item("h2", "hw", 0, 90)]);
    expect(g.categories[0].percent).toBe(10);
  });
  it("returns null when nothing is graded", () => {
    const g = computeGrade(weighted, [item("h1", "hw", null)]);
    expect(g.percent).toBeNull();
    expect(g.letter).toBeNull();
  });
  it("applies drop-lowest per category", () => {
    const s = { ...weighted, categories: [{ ...cats[0], dropLowest: 1 }, ...cats.slice(1)] };
    const g = computeGrade(s, [item("h1", "hw", 0), item("h2", "hw", 100), item("h3", "hw", 80)]);
    expect(g.categories[0].percent).toBe(90);
    expect(g.categories[0].droppedIds).toEqual(["h1"]);
  });
  it("applies curve after the raw percent", () => {
    const g = computeGrade({ ...weighted, curve: 3 }, [item("h1", "hw", 87)]);
    expect(g.rawPercent).toBe(87);
    expect(g.percent).toBe(90);
    expect(g.letter).toBe("A-");
  });
  it("allows over 100 with extra credit", () => {
    const g = computeGrade(weighted, [item("h1", "hw", 100), item("x", "hw", 10, 0)]);
    expect(g.percent).toBeCloseTo(110, 8);
  });
  it("warns on bad weights and uncategorized items", () => {
    const g = computeGrade({ ...weighted, categories: cats.slice(0, 2) }, [item("u", null, 50)]);
    expect(g.warnings.length).toBe(2);
  });
});

describe("computeGrade: total points", () => {
  const pts: GradingScheme = { mode: "points", categories: [], scale: STANDARD_SCALE, curve: 0 };
  it("divides total earned by total possible", () => {
    const g = computeGrade(pts, [item("a", null, 45, 50), item("b", null, 150, 200), item("c", null, null, 100)]);
    expect(g.percent).toBeCloseTo((195 / 250) * 100, 8);
    expect(g.earnedPoints).toBe(195);
    expect(g.gradedCount).toBe(2);
    expect(g.possiblePoints).toBe(250);
  });
  it("supports drops through categories and extra credit", () => {
    const s: GradingScheme = { ...pts, categories: [{ id: "q", name: "Quizzes", weight: 0, dropLowest: 1 }] };
    const g = computeGrade(s, [item("q1", "q", 2, 10), item("q2", "q", 10, 10), item("e", null, 5, 0)]);
    expect(g.earnedPoints).toBe(15);
    expect(g.possiblePoints).toBe(10);
  });
});

describe("hypothetical and projected", () => {
  const base = [item("h1", "hw", 90), item("q1", "qz", 80), item("m1", "mt", 85), item("f", "fn", null)];
  it("applyScenario overrides without mutating", () => {
    const out = applyScenario(base, { f: 95 });
    expect(out[3].earned).toBe(95);
    expect(base[3].earned).toBeNull();
    const g = computeGrade(weighted, out, "hypothetical");
    // .2*90+.1*80+.4*85+.3*95 = 18+8+34+28.5 = 88.5
    expect(g.percent).toBeCloseTo(88.5, 8);
    expect(g.kind).toBe("hypothetical");
  });
  it("projects ungraded work at an assumed percent", () => {
    const g = projectGrade(weighted, base, 100);
    expect(g.percent).toBeCloseTo(18 + 8 + 34 + 30, 8);
    expect(g.kind).toBe("projected");
  });
  it("projection fills categories that have no items yet", () => {
    const g = projectGrade(weighted, [item("h1", "hw", 100)], 50);
    // hw 100*.2 + others 50 -> .2*100 + .8*50 = 60
    expect(g.percent).toBeCloseTo(60, 8);
  });
  it("gradeRange gives worst and best case", () => {
    const r = gradeRange(weighted, base);
    expect(r.min.percent).toBeCloseTo(60, 8);
    expect(r.max.percent).toBeCloseTo(90, 8);
  });
});

describe("remainingItems", () => {
  it("adds placeholders for empty weighted categories", () => {
    const rem = remainingItems(weighted, [item("h1", "hw", 100)]);
    expect(rem.map((r) => r.id).sort()).toEqual(["placeholder:fn", "placeholder:mt", "placeholder:qz"]);
  });
});

describe("requiredScore", () => {
  const base = [item("h1", "hw", 90), item("q1", "qz", 80), item("m1", "mt", 85), item("f", "fn", null)];
  it("finds the final score needed for an A", () => {
    const r = requiredScore(weighted, base, 93);
    // 60 so far = 18+8+34 = 60; need 33 from .3*x => x = 110 -> not achievable
    expect(r.requiredPercent).toBeCloseTo(110, 4);
    expect(r.achievable).toBe(false);
  });
  it("finds an achievable target", () => {
    const r = requiredScore(weighted, base, 85);
    // need 25 / .3 = 83.333
    expect(r.requiredPercent).toBeCloseTo(83.3333, 3);
    expect(r.achievable).toBe(true);
    expect(r.requiredPointsPerItem[0].points).toBeCloseTo(83.3333, 3);
  });
  it("reports already secured", () => {
    const r = requiredScore(weighted, base, 60);
    expect(r.alreadySecured).toBe(true);
    expect(r.requiredPercent).toBe(0);
  });
  it("handles no remaining work", () => {
    const r = requiredScore(weighted, [item("h", "hw", 1), item("q", "qz", 1), item("m", "mt", 1), item("f", "fn", 1)], 90);
    expect(r.requiredPercent).toBeNull();
    expect(r.reason).toBeTruthy();
  });
  it("works with drop-lowest (non-linear) via bisection", () => {
    const s: GradingScheme = { mode: "points", categories: [{ id: "h", name: "HW", weight: 0, dropLowest: 1 }], scale: STANDARD_SCALE, curve: 0 };
    const items = [item("a", "h", 50), item("b", "h", 100), item("c", "h", null)];
    const r = requiredScore(s, items, 90);
    // c at p: if p>=50, drop a (50): (100+p)/200 => p=80
        expect(r.requiredPercent).toBeCloseTo(80, 3);
  });
  it("targets one item while assuming a percent for others", () => {
    const items = [item("a", null, 80), item("b", null, null), item("c", null, null)];
    const pts: GradingScheme = { mode: "points", categories: [], scale: STANDARD_SCALE, curve: 0 };
    const r = requiredScore(pts, items, 85, { itemIds: ["c"], othersPercent: 80 });
    // (80+80+x)/300 = .85 -> x = 95
    expect(r.requiredPercent).toBeCloseTo(95, 3);
  });
  it("includes the curve", () => {
    const r = requiredScore({ ...weighted, curve: 5 }, base, 90);
    expect(r.requiredPercent).toBeCloseTo(((85 - 60) / 0.3), 3);
  });
});

describe("validateScheme", () => {
  it("flags weights not totalling 100", () => {
    expect(validateScheme({ ...weighted, categories: cats.slice(0, 2) })[0]).toMatch(/30%/);
    expect(validateScheme(weighted)).toEqual([]);
  });
});
