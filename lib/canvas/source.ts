import { z } from "zod";
import { rawCourseInfoSchema, type RawInfo } from "@/lib/course-info/schemas";
import type { CanvasAnnouncement, CanvasAssignment, CanvasAssignmentGroup, CanvasCourse } from "./types";

/** Where sync gets its Canvas data: the API client (token/OAuth) or a payload uploaded by the browser extension. */
export interface CanvasSource {
  courses(): Promise<CanvasCourse[]>;
  assignmentGroups(courseId: number | string): Promise<CanvasAssignmentGroup[]>;
  assignments(courseId: number | string): Promise<CanvasAssignment[]>;
  announcements(courseId: number | string, sinceIso: string): Promise<CanvasAnnouncement[]>;
  /** Everything else worth knowing about the course (syllabus tab, pages, staff, calendar, tabs, modules). Optional and best-effort. */
  courseInfo?(courseId: number | string): Promise<RawInfo | null>;
}

const id = z.union([z.string().max(40), z.number()]).transform(String);
const text = (max: number) => z.string().nullish().transform((s) => (typeof s === "string" ? s.slice(0, max) : null));
const num = z.number().finite().nullish().catch(null).transform((n) => n ?? null);
const date = z.string().nullish().transform((s) => (s && !Number.isNaN(Date.parse(s)) ? s : null));

const submission = z.object({
  workflow_state: text(30), score: num, grade: text(30), excused: z.boolean().nullish().catch(null),
  submitted_at: date, graded_at: date, missing: z.boolean().optional().catch(undefined), late: z.boolean().optional().catch(undefined),
});

export const courseBundleSchema = z.object({
  course: z.object({
    id, name: text(300), course_code: text(100), workflow_state: text(30), access_restricted_by_date: z.boolean().optional().catch(undefined),
    apply_assignment_group_weights: z.boolean().optional().catch(undefined), term: z.object({ name: text(100) }).nullish().catch(null),
  }),
  groups: z.array(z.object({
    id, name: text(200), group_weight: num,
    rules: z.object({ drop_lowest: z.number().int().min(0).max(100).optional().catch(undefined) }).nullish().catch(null),
  })).max(60),
  assignments: z.array(z.object({
    id, name: text(500), description: text(8000), due_at: date, points_possible: num, assignment_group_id: id.nullish().catch(null),
    submission_types: z.array(z.string().max(40)).max(10).optional().catch(undefined), html_url: text(1000), published: z.boolean().optional().catch(undefined),
    omit_from_final_grade: z.boolean().optional().catch(undefined), submission: submission.nullish().catch(null),
  })).max(2000),
  announcements: z.array(z.object({ id, title: text(300), message: text(6000), posted_at: date, html_url: text(1000) })).max(60).default([]),
  /** Set by the extension when it couldn't load this course (e.g. no access). */
  error: text(300).optional(),
  /** Course info collected by the extension (already text). Optional: older extension versions don't send it. */
  info: rawCourseInfoSchema.nullish().catch(null),
});

export const ingestSchema = z.object({
  baseUrl: z.string().min(1).max(200),
  timeZone: z.string().max(64).default("UTC"),
  courses: z.array(courseBundleSchema).min(1, "No courses were received from Canvas.").max(60),
});

export type CourseBundle = z.infer<typeof courseBundleSchema>;

export class PayloadSource implements CanvasSource {
  constructor(private bundles: CourseBundle[]) {}
  private find(id: number | string) {
    const b = this.bundles.find((x) => x.course.id === String(id));
    if (!b) throw new Error("Course missing from upload");
    return b;
  }
  private ok(id: number | string) {
    const b = this.find(id);
    if (b.error) throw new Error(b.error);
    return b;
  }
  async courses() { return this.bundles.map((b) => b.course as unknown as CanvasCourse); }
  async assignmentGroups(id: number | string) { return this.find(id).groups as unknown as CanvasAssignmentGroup[]; }
  async assignments(id: number | string) { return this.ok(id).assignments as unknown as CanvasAssignment[]; }
  async announcements(id: number | string) { return this.find(id).announcements as unknown as CanvasAnnouncement[]; }
  async courseInfo(id: number | string) { return this.find(id).info ?? null; }
}
