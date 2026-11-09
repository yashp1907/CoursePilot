import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null);
const isoTime = z.string().regex(/^\d{2}:\d{2}$/).nullable().catch(null);
const text = z.string().nullable().catch(null);
const basis = z.enum(["explicit", "inferred"]).catch("inferred");

export const ASSIGNMENT_TYPES = ["homework", "quiz", "exam", "project", "paper", "lab", "reading", "presentation", "other"] as const;

export const syllabusExtractionSchema = z.object({
  course: z.object({
    name: text, code: text, professor: text, professor_email: text, office_hours: text,
    classroom: text, semester: text, credits: z.number().nullable().catch(null), description: text,
  }),
  /** Course fields whose values were inferred rather than stated. */
  inferred_fields: z.array(z.string()).catch([]),
  grading: z.object({
    type: z.enum(["weighted", "points", "unknown"]).catch("unknown"),
    categories: z.array(z.object({
      name: z.string(), weight: z.number().nullable().catch(null), drop_lowest: z.number().int().nullable().catch(null),
      basis, source_text: text,
    })),
    scale: z.array(z.object({ letter: z.string(), min: z.number() })),
    notes: text,
  }),
  assignments: z.array(z.object({
    title: z.string(), type: z.enum(ASSIGNMENT_TYPES).catch("other"),
    due_date: isoDate, due_time: isoTime, points: z.number().nullable().catch(null),
    category: text, recurrence: text, basis, source_text: text,
    /** Course websites: link to the assignment's page/spec, and the weekday as printed (used to verify the year). */
    url: text, weekday: text,
  })),
  important_dates: z.array(z.object({
    title: z.string(), kind: z.enum(["exam", "holiday", "break", "milestone", "other"]).catch("other"),
    date: isoDate, end_date: isoDate, time: isoTime, basis, source_text: text, weekday: text,
  })),
  policies: z.object({
    late_submission: text, drop_policy: text, attendance: text, extra_credit: text, exam_policy: text, grading_scale_notes: text,
    other: z.array(z.object({ title: z.string(), text: z.string() })),
  }),
  /** Things the model could not determine or was unsure about. */
  warnings: z.array(z.string()).catch([]),
});

export type SyllabusExtraction = z.infer<typeof syllabusExtractionSchema>;

export const EMPTY_EXTRACTION: SyllabusExtraction = {
  course: { name: null, code: null, professor: null, professor_email: null, office_hours: null, classroom: null, semester: null, credits: null, description: null },
  inferred_fields: [],
  grading: { type: "unknown", categories: [], scale: [], notes: null },
  assignments: [],
  important_dates: [],
  policies: { late_submission: null, drop_policy: null, attendance: null, extra_credit: null, exam_policy: null, grading_scale_notes: null, other: [] },
  warnings: [],
};

// Gemini rejects schemas that carry many size/pattern constraints ("too complex"). Those are enforced locally by Zod
// after the response arrives, so they are removed from the copy sent to the model.
const GEMINI_UNSUPPORTED = new Set(["maxLength", "minLength", "maxItems", "minItems", "pattern", "default", "format", "$schema"]);
function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).filter(([k]) => !GEMINI_UNSUPPORTED.has(k)).map(([k, v]) => [k, stripUnsupported(v)]));
  return node;
}

export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return stripUnsupported(js) as Record<string, unknown>;
}
