import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/ai/gemini";
import { COURSE_INFO_SYSTEM_PROMPT, courseInfoUserPrompt } from "@/lib/ai/prompts-course-info";
import { userMessage } from "@/lib/utils/errors";
import { courseFieldFills, finalizeCourseInfo } from "@/lib/course-info/merge";
import { courseInfoSchema, rawCourseInfoSchema, type CourseInfo } from "@/lib/course-info/schemas";

export interface ProcessResult { processed: { courseId: string; label: string; status: "ready" | "empty" | "failed"; error?: string } | null; remaining: number }

/**
 * Turn the next pending course's raw Canvas pages into a structured fact sheet (one course per call so each call
 * fits comfortably in a request). Canvas's staff list is authoritative; the AI adds what the pages say.
 */
export async function processCourseInfo(supabase: SupabaseClient, opts: { courseId?: string } = {}): Promise<ProcessResult> {
  let q = supabase.from("course_info").select("id, course_id, raw, raw_hash, info").eq("status", "pending").order("fetched_at").limit(1);
  if (opts.courseId) q = supabase.from("course_info").select("id, course_id, raw, raw_hash, info").eq("course_id", opts.courseId).limit(1);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const row = rows?.[0];
  const pendingCount = async () => (await supabase.from("course_info").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0;
  if (!row) return { processed: null, remaining: await pendingCount() };

  const { data: course } = await supabase.from("courses").select("id, name, code, professor, professor_email, office_hours, classroom, description").eq("id", row.course_id).maybeSingle();
  const label = course?.code ?? course?.name ?? "course";
  const raw = rawCourseInfoSchema.safeParse(row.raw);
  const done = async (status: "ready" | "empty" | "failed", patch: Record<string, unknown> = {}, err?: string): Promise<ProcessResult> => {
    await supabase.from("course_info").update({ status, error: err ?? null, extracted_at: new Date().toISOString(), ...patch }).eq("id", row.id);
    return { processed: { courseId: row.course_id as string, label, status, error: err }, remaining: await pendingCount() };
  };
  if (!raw.success) return done("failed", {}, "The stored course pages couldn't be read.");
  const r = raw.data;
  if (!r.syllabus_text && !r.pages.length && !r.people.length && !r.events.length && !r.tabs.length && !r.modules.length) return done("empty");

  try {
    const { data: ai, model } = await generateStructured({
      schema: courseInfoSchema, system: COURSE_INFO_SYSTEM_PROMPT,
      prompt: courseInfoUserPrompt(r, { courseName: course?.code ? `${course.code} ${course.name}` : course?.name ?? null, today: new Date().toISOString().slice(0, 10) }),
    });
    const info: CourseInfo = finalizeCourseInfo(ai, r);
    if (course) {
      const fills = courseFieldFills(course as never, info);
      if (Object.keys(fills).length) await supabase.from("courses").update(fills).eq("id", course.id);
    }
    return done("ready", { info, model });
  } catch (e) {
    // Canvas's staff list is still worth keeping even when the AI step fails.
    const basic = r.people.length ? finalizeCourseInfo(courseInfoSchema.parse({}), r) : null;
    console.error("course-info extraction failed", e);
    return done("failed", basic ? { info: basic } : {}, userMessage(e, "We couldn't finish reading this course's pages."));
  }
}
