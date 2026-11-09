import { z } from "zod";

const text = (max: number) => z.string().nullish().transform((s) => (typeof s === "string" ? s.slice(0, max) : null));
const time = z.string().regex(/^\d{2}:\d{2}$/).nullish().catch(null).transform((t) => t ?? null);
const basis = z.enum(["explicit", "inferred"]).catch("inferred");

/** What the collector read from Canvas, validated and size-bounded (also the shape the browser extension uploads). */
export const rawCourseInfoSchema = z.object({
  syllabus_text: text(14000),
  pages: z.array(z.object({ title: z.string().max(200).catch(""), url: text(500), text: z.string().max(14000), front: z.boolean().optional().catch(undefined) })).max(10).default([]),
  people: z.array(z.object({ name: z.string().min(1).max(120), role: z.string().max(60).catch(""), base_role: z.enum(["teacher", "ta", "designer"]).optional().catch(undefined), email: text(160), bio: text(500) })).max(80).default([]),
  sections: z.array(z.object({ name: z.string().min(1).max(120), start: text(40), end: text(40) })).max(40).default([]),
  events: z.array(z.object({ title: z.string().min(1).max(200), start: text(40), end: text(40), all_day: z.boolean().catch(false), location: text(200), description: text(500) })).max(80).default([]),
  tabs: z.array(z.object({ label: z.string().min(1).max(80), url: text(500), external: z.boolean().catch(false) })).max(40).default([]),
  modules: z.array(z.object({ name: z.string().min(1).max(120), items: z.array(z.string().max(120)).max(15).default([]) })).max(50).default([]),
});
export type RawInfo = z.infer<typeof rawCourseInfoSchema>;

export const ROLE_KINDS = ["instructor", "ta", "ia", "grader", "coordinator", "other"] as const;
export const MEETING_KINDS = ["lecture", "lab", "discussion", "recitation", "office_hours", "exam", "other"] as const;

/** Structured understanding of a course (Gemini output, merged with Canvas's own staff list). */
export const courseInfoSchema = z.object({
  summary: text(700),
  meetings: z.array(z.object({
    kind: z.enum(MEETING_KINDS).catch("other"), title: text(120), days: text(60), start_time: time, end_time: time,
    location: text(160), person: text(120), section: text(60), notes: text(300), basis, source_text: text(160),
  })).default([]),
  people: z.array(z.object({
    name: z.string().min(1), role: z.enum(ROLE_KINDS).catch("other"), title: text(80), email: text(160),
    office_hours: text(300), location: text(160), notes: text(300), source: z.enum(["canvas", "page"]).catch("page"),
  })).default([]),
  contacts: z.array(z.object({ label: z.string().min(1), type: z.enum(["email", "forum", "url", "phone", "form"]).catch("url"), value: z.string().min(1) })).default([]),
  links: z.array(z.object({ label: z.string().min(1), url: z.string(), kind: z.enum(["forum", "gradescope", "meeting", "textbook", "calendar", "notes", "autograder", "resource", "other"]).catch("other") })).default([]),
  textbooks: z.array(z.object({ title: z.string().min(1), notes: text(200) })).default([]),
  key_info: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).default([]),
  grading_summary: text(500),
  policies: z.object({ late: text(500), attendance: text(500), exams: text(500), collaboration: text(500), other: z.array(z.object({ title: z.string(), text: z.string() })).default([]) }).default({ late: null, attendance: null, exams: null, collaboration: null, other: [] }),
  warnings: z.array(z.string()).catch([]),
});
export type CourseInfo = z.infer<typeof courseInfoSchema>;

/** Reasonable caps, applied after the model answers so one long list can never invalidate the whole result. */
export const INFO_CAPS = { meetings: 40, people: 80, contacts: 25, links: 40, textbooks: 10, key_info: 30, warnings: 10, policiesOther: 10 } as const;
export function capCourseInfo(i: CourseInfo): CourseInfo {
  const clip = (v: string | null, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
  return {
    ...i, summary: clip(i.summary, 700),
    meetings: i.meetings.slice(0, INFO_CAPS.meetings).map((m) => ({ ...m, title: clip(m.title, 120), notes: clip(m.notes, 300), location: clip(m.location, 160) })),
    people: i.people.slice(0, INFO_CAPS.people).map((p) => ({ ...p, name: p.name.slice(0, 120), office_hours: clip(p.office_hours, 300), notes: clip(p.notes, 300) })),
    contacts: i.contacts.slice(0, INFO_CAPS.contacts).map((c) => ({ ...c, label: c.label.slice(0, 100), value: c.value.slice(0, 300) })),
    links: i.links.slice(0, INFO_CAPS.links).map((l) => ({ ...l, label: l.label.slice(0, 100), url: l.url.slice(0, 500) })),
    textbooks: i.textbooks.slice(0, INFO_CAPS.textbooks), key_info: i.key_info.slice(0, INFO_CAPS.key_info).map((k) => ({ ...k, value: k.value.slice(0, 400) })),
    warnings: i.warnings.slice(0, INFO_CAPS.warnings),
    policies: { ...i.policies, other: i.policies.other.slice(0, INFO_CAPS.policiesOther) },
  };
}

export const EMPTY_COURSE_INFO: CourseInfo = courseInfoSchema.parse({});

/** Stable fingerprint of what was read, to skip re-extraction when nothing changed. */
export async function rawHash(raw: RawInfo): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(JSON.stringify([raw.syllabus_text, raw.pages, raw.people, raw.sections, raw.tabs, raw.modules, raw.events.map((e) => [e.title, e.start, e.end, e.location])])).digest("hex");
}
