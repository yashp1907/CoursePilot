import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantSnapshot } from "./assistant-tools";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

/** Load the signed-in student's data (RLS-scoped) into a snapshot for the assistant tools. */
export async function loadSnapshot(supabase: SupabaseClient, opts: { timeZone: string; focusCourseId: string | null }): Promise<AssistantSnapshot> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [courses, cats, asg, grades, syl, hist, ann, sync, prof, settings, infoRes] = await Promise.all([
    supabase.from("courses").select("*").eq("archived", false),
    supabase.from("grading_categories").select("*"),
    supabase.from("assignments").select("*").limit(2000),
    supabase.from("assignment_grades").select("id, assignment_id, points_earned, excused"),
    supabase.from("syllabi").select("course_id, file_name, status, extracted"),
    supabase.from("assignment_history").select("assignment_id, field, old_value, new_value, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(100),
    supabase.from("course_announcements").select("course_id, title, posted_at").gte("posted_at", since).order("posted_at", { ascending: false }).limit(50),
    supabase.from("canvas_sync_history").select("status, finished_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("grade_scale_preset").maybeSingle(),
    supabase.from("user_settings").select("weekly_study_hours").maybeSingle(),
    supabase.from("course_info").select("course_id, info, raw"),
  ]);
  return {
    now: new Date(), timeZone: opts.timeZone, focusCourseId: opts.focusCourseId, presetKey: (prof.data as { grade_scale_preset?: string } | null)?.grade_scale_preset ?? "standard",
    courses: (courses.data ?? []) as Course[], categories: (cats.data ?? []) as GradingCategoryRow[], assignments: (asg.data ?? []) as Assignment[],
    grades: (grades.data ?? []) as AssignmentGrade[], syllabi: (syl.data ?? []) as AssistantSnapshot["syllabi"],
    // Tables added in migration 2 may be absent until it is applied: treat errors as empty.
    history: hist.error ? [] : ((hist.data ?? []) as AssistantSnapshot["history"]), announcements: ann.error ? [] : ((ann.data ?? []) as AssistantSnapshot["announcements"]),
    courseInfo: infoRes.error ? [] : (infoRes.data ?? []).map((r) => ({ course_id: r.course_id as string, info: r.info, modules: ((r.raw as { modules?: { name: string; items: string[] }[] } | null)?.modules ?? []) })),
    lastSync: (sync.data as AssistantSnapshot["lastSync"]) ?? null, weeklyStudyHours: Number((settings.data as { weekly_study_hours?: number } | null)?.weekly_study_hours ?? 15),
  };
}
