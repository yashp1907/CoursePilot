import { describe, expect, it } from "vitest";
import { COURSE_COLORS, courseHex, isValidCourseColor, readable, tint } from "./colors";
import { moveItem } from "./reorder";

describe("course colors", () => {
  it("accepts palette names and #rrggbb, rejects everything else", () => {
    for (const c of COURSE_COLORS) expect(isValidCourseColor(c)).toBe(true);
    expect(isValidCourseColor("#12A4b6")).toBe(true);
    for (const bad of ["", "red-ish", "#fff", "#12345", "#12345g", "javascript:alert(1)", "url(x)", "red; background:url(x)", null, 5]) expect(isValidCourseColor(bad as never)).toBe(false);
  });
  it("resolves names and custom hexes, falling back to blue for unknown values", () => {
    expect(courseHex("rose")).toBe("#e0457b");
    expect(courseHex("#ABCDEF")).toBe("#abcdef");
    expect(courseHex("not-a-color")).toBe(courseHex("blue"));
    expect(courseHex(null)).toBe(courseHex("blue"));
  });
  it("legacy stored names still resolve (rose, teal, amber, violet, slate, orange, green, blue)", () => {
    for (const n of ["rose", "teal", "amber", "violet", "slate", "orange", "green", "blue"]) expect(courseHex(n)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("builds theme-safe CSS: tint is translucent, text blends toward the foreground", () => {
    expect(tint("blue", 14)).toBe("color-mix(in srgb, #3b6cf0 14%, transparent)");
    expect(readable("#12a4b6")).toContain("var(--foreground)");
  });
  it("palette colors are all distinct", () => { expect(new Set(COURSE_COLORS.map(courseHex)).size).toBe(COURSE_COLORS.length); });
});

describe("moveItem", () => {
  const l = ["a", "b", "c", "d"];
  it("moves forward and backward without mutating", () => {
    expect(moveItem(l, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(l, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(l).toEqual(["a", "b", "c", "d"]);
  });
  it("clamps targets and ignores bad indexes", () => {
    expect(moveItem(l, 0, -1)).toEqual(l);
    expect(moveItem(l, 3, 4)).toEqual(l);
    expect(moveItem(l, 9, 0)).toEqual(l);
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});
