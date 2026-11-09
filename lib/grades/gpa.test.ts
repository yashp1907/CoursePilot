import { describe, expect, it } from "vitest";
import { computeGpa } from "./gpa";

describe("computeGpa", () => {
  it("weights by credits", () => {
    const r = computeGpa([{ credits: 4, letter: "A" }, { credits: 2, letter: "B" }]);
    expect(r?.gpa).toBeCloseTo((16 + 6) / 6, 8);
    expect(r?.counted).toBe(2);
  });
  it("skips courses without credits or letters", () => {
    const r = computeGpa([{ credits: null, letter: "A" }, { credits: 3, letter: null }, { credits: 3, letter: "A-" }]);
    expect(r?.gpa).toBeCloseTo(3.7, 8);
    expect(r?.counted).toBe(1);
  });
  it("returns null when nothing is usable", () => {
    expect(computeGpa([{ credits: 3, letter: null }])).toBeNull();
    expect(computeGpa([])).toBeNull();
  });
  it("treats custom letters as unusable rather than guessing", () => {
    expect(computeGpa([{ credits: 3, letter: "P" }])).toBeNull();
  });
});
