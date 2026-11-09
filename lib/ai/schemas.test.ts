import { describe, expect, it } from "vitest";
import { EMPTY_EXTRACTION, syllabusExtractionSchema, toGeminiJsonSchema } from "./schemas";

describe("syllabusExtractionSchema", () => {
  it("accepts the empty extraction", () => {
    expect(syllabusExtractionSchema.safeParse(EMPTY_EXTRACTION).success).toBe(true);
  });

  it("coerces malformed optional values to null instead of trusting them", () => {
    const r = syllabusExtractionSchema.parse({
      ...EMPTY_EXTRACTION,
      assignments: [{ title: "HW1", type: "weird", due_date: "next Friday", due_time: "5pm", points: "ten", category: null, recurrence: null, basis: "guess", source_text: null }],
      important_dates: [{ title: "Midterm", kind: "exam", date: "2026-10-15", end_date: "15/10", time: null, basis: "explicit", source_text: null }],
    });
    const a = r.assignments[0];
    expect(a.type).toBe("other");
    expect(a.due_date).toBeNull();
    expect(a.due_time).toBeNull();
    expect(a.points).toBeNull();
    expect(a.basis).toBe("inferred"); // unknown basis is treated as the less-trusted value
    expect(r.important_dates[0].date).toBe("2026-10-15");
    expect(r.important_dates[0].end_date).toBeNull();
  });

  it("rejects structurally wrong output (missing required sections)", () => {
    expect(syllabusExtractionSchema.safeParse({ course: {} }).success).toBe(false);
    expect(syllabusExtractionSchema.safeParse("nope").success).toBe(false);
  });

  it("requires an assignment title rather than inventing one", () => {
    const bad = { ...EMPTY_EXTRACTION, assignments: [{ type: "homework", due_date: null }] };
    expect(syllabusExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("toGeminiJsonSchema", () => {
  it("emits a plain JSON schema without the $schema key", () => {
    const js = toGeminiJsonSchema(syllabusExtractionSchema) as { $schema?: string; type?: string; properties?: Record<string, unknown>; required?: string[] };
    expect(js.$schema).toBeUndefined();
    expect(js.type).toBe("object");
    expect(Object.keys(js.properties ?? {})).toEqual(expect.arrayContaining(["course", "grading", "assignments", "important_dates", "policies"]));
  });
});
