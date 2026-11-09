import { z } from "zod";
import { isValidCourseColor } from "@/lib/utils/colors";

const optText = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().finite().nullable());

export const courseSchema = z.object({
  name: z.string().trim().min(1, "Course name is required.").max(200),
  code: optText(40),
  professor: optText(120),
  professor_email: z.string().trim().email("Enter a valid email.").optional().nullable().or(z.literal("")).transform((v) => v || null),
  office_hours: optText(300),
  classroom: optText(120),
  semester: optText(60),
  credits: optNum.refine((v) => v === null || (v >= 0 && v <= 30), "Credits must be between 0 and 30.").optional(),
  description: optText(4000),
  color: z.string().refine(isValidCourseColor, "Choose a color from the palette or a valid #rrggbb value.").default("blue"),
});
export type CourseInput = z.input<typeof courseSchema>;

export const ASSIGNMENT_TYPE_VALUES = ["homework", "quiz", "exam", "project", "paper", "lab", "reading", "presentation", "study", "other"] as const;

export const assignmentSchema = z.object({
  course_id: z.string().uuid("Choose a course."),
  category_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  title: z.string().trim().min(1, "Title is required.").max(300),
  description: optText(4000),
  type: z.enum(ASSIGNMENT_TYPE_VALUES).default("homework"),
  due_at: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  estimated_minutes: optNum.refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 10000), "Enter whole minutes (0-10000).").optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["not_started", "in_progress", "completed", "submitted"]).default("not_started"),
  points_possible: optNum.refine((v) => v === null || v >= 0, "Points cannot be negative.").optional(),
  is_extra_credit: z.boolean().default(false),
});
export type AssignmentInput = z.input<typeof assignmentSchema>;

export const eventSchema = z.object({
  course_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  title: z.string().trim().min(1, "Title is required.").max(300),
  description: optText(2000),
  kind: z.enum(["event", "exam", "holiday", "milestone", "study"]).default("event"),
  starts_at: z.string().datetime("Choose a start date and time."),
  ends_at: z.string().datetime().nullable().optional().transform((v) => v ?? null),
  all_day: z.boolean().default(false),
}).refine((v) => !v.ends_at || v.ends_at >= v.starts_at, { path: ["ends_at"], message: "End must be after the start." });

export const schemeSchema = z.object({
  mode: z.enum(["weighted", "points"]),
  curve: z.number().min(-100).max(100).default(0),
  scale: z.array(z.object({ letter: z.string().trim().min(1).max(4), min: z.number().min(0).max(1000) })).min(1).max(30).nullable(),
  categories: z.array(z.object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1, "Category names can't be empty.").max(120),
    weight: z.number().min(0, "Weights can't be negative.").max(100, "A weight can't exceed 100%."),
    drop_lowest: z.number().int().min(0).max(50),
  })).max(40),
});
export type SchemeInput = z.input<typeof schemeSchema>;

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required.").max(100),
  university: optText(120),
  current_semester: optText(60),
  grade_scale_preset: z.enum(["standard", "straight", "plus_minus_a_plus"]),
});

export const settingsSchema = z.object({
  notify_deadlines: z.boolean(), notify_overdue: z.boolean(), notify_canvas: z.boolean(), notify_exams: z.boolean(),
  deadline_lead_hours: z.number().int().min(1).max(336),
  weekly_study_hours: z.number().min(0).max(100),
});
