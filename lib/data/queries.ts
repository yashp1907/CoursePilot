import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ActivityEntry, Assignment, AssignmentGrade, CalendarEvent, Course, GradingCategoryRow, Syllabus } from "@/types/database";

/**
 * Every fetcher is wrapped in React's per-request `cache`, so the layout and the page (or two components) asking for
 * the same data share ONE database round trip. Each round trip costs ~150-300 ms, so avoiding repeats is the biggest
 * lever on speed. Callers should start independent fetches together with Promise.all.
 */
async function sb() { return createClient(); }

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Failed to load ${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

export const listCourses = cache(async (): Promise<Course[]> => {
  const s = await sb();
  // Ordered by the student's own order. Falls back to creation order until migration 0004 is applied.
  const ordered = await s.from("courses").select("*").eq("archived", false).order("sort_order").order("created_at");
  if (!ordered.error) return ordered.data as Course[];
  if (!/sort_order/.test(ordered.error.message)) throw new Error(`Failed to load courses: ${ordered.error.message}`);
  return must(await s.from("courses").select("*").eq("archived", false).order("created_at"), "courses");
});

/** Next position at the end of the student's list, or null if the order column doesn't exist yet. */
export async function nextCourseOrder(): Promise<number | null> {
  const s = await sb();
  const { data, error } = await s.from("courses").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return ((data as { sort_order?: number } | null)?.sort_order ?? 0) + 1;
}

export const getCourse = cache(async (id: string): Promise<Course | null> => {
  const s = await sb();
  const { data } = await s.from("courses").select("*").eq("id", id).maybeSingle();
  return (data as Course | null) ?? null;
});

export const listCategories = cache(async (courseId?: string): Promise<GradingCategoryRow[]> => {
  const s = await sb();
  let q = s.from("grading_categories").select("*").order("sort_order");
  if (courseId) q = q.eq("course_id", courseId);
  return must(await q, "grading categories");
});

type GradeEmbed = Pick<AssignmentGrade, "id" | "points_earned" | "excused" | "graded_at">;
/**
 * Assignments AND their grades in one round trip (PostgREST embed), already split into the two lists the rest of
 * the app uses. One query replaces "all assignments" + "every grade ever entered".
 */
export const listAssignmentsWithGrades = cache(async (courseId?: string): Promise<{ assignments: Assignment[]; grades: AssignmentGrade[] }> => {
  const s = await sb();
  let q = s.from("assignments").select("*, assignment_grades(id, points_earned, excused, graded_at)").order("due_at", { ascending: true, nullsFirst: false });
  if (courseId) q = q.eq("course_id", courseId);
  const rows = must(await q, "assignments") as (Assignment & { assignment_grades?: GradeEmbed[] | GradeEmbed | null })[];
  const assignments: Assignment[] = [];
  const grades: AssignmentGrade[] = [];
  for (const { assignment_grades, ...a } of rows) {
    assignments.push(a as Assignment);
    const g = Array.isArray(assignment_grades) ? assignment_grades[0] : assignment_grades;   // to-one or to-many, depending on how PostgREST sees the key
    if (g) grades.push({ ...g, assignment_id: a.id });
  }
  return { assignments, grades };
});

export const listAssignments = cache(async (courseId?: string): Promise<Assignment[]> => (await listAssignmentsWithGrades(courseId)).assignments);
export const listGrades = cache(async (): Promise<AssignmentGrade[]> => (await listAssignmentsWithGrades(undefined)).grades);

export const listEvents = cache(async (): Promise<CalendarEvent[]> => {
  const s = await sb();
  return must(await s.from("calendar_events").select("*").order("starts_at"), "events");
});
export const getSyllabus = cache(async (courseId: string): Promise<Syllabus | null> => {
  const s = await sb();
  const { data } = await s.from("syllabi").select("*").eq("course_id", courseId).maybeSingle();
  return (data as Syllabus | null) ?? null;
});
export const listActivity = cache(async (limit = 8, courseId?: string): Promise<ActivityEntry[]> => {
  const s = await sb();
  let q = s.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (courseId) q = q.eq("course_id", courseId);
  return must(await q, "activity");
});
