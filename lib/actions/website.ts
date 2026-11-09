"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, fail, logActivity, type ActionResult } from "./helpers";
import { applyExtraction, type ApplyResult } from "@/lib/server/apply-extraction";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";
import { validatePublicUrl, WebFetchError } from "@/lib/website/safe-fetch";

const MIGRATION = "Apply the latest database migration (…0005_course_websites.sql) to use course websites.";
const dbError = (m: string) => (/course_websites|schema cache|relation/.test(m) ? MIGRATION : m);

/** Attach (or change) the website a course keeps its schedule on. */
export async function setCourseWebsite(courseId: string, url: string): Promise<ActionResult<{ url: string }>> {
  try {
    if (!z.string().uuid().safeParse(courseId).success) return { ok: false, error: "Invalid course." };
    let clean: string;
    try { clean = validatePublicUrl(url).toString(); } catch (e) { return { ok: false, error: e instanceof WebFetchError ? e.message : "Enter a valid https:// address." }; }
    const { supabase, user } = await authed();
    const { data: existing, error: se } = await supabase.from("course_websites").select("id, url").eq("course_id", courseId).maybeSingle();
    if (se) return { ok: false, error: dbError(se.message) };
    if (existing) {
      const { error } = await supabase.from("course_websites").update({ url: clean, ...(existing.url !== clean ? { status: "idle", extracted: null, content_hash: null, pages: [], error: null } : {}) }).eq("id", existing.id);
      if (error) return { ok: false, error: dbError(error.message) };
    } else {
      const { error } = await supabase.from("course_websites").insert({ user_id: user.id, course_id: courseId, url: clean });
      if (error) return { ok: false, error: dbError(error.message) };
    }
    revalidatePath(`/courses/${courseId}`); revalidatePath("/integrations");
    return { ok: true, data: { url: clean } };
  } catch (e) { return fail(e); }
}

export async function removeCourseWebsite(courseId: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("course_websites").delete().eq("course_id", courseId);
    if (error) return { ok: false, error: dbError(error.message) };
    revalidatePath(`/courses/${courseId}`); revalidatePath("/integrations");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function saveWebsiteExtraction(courseId: string, extraction: unknown): Promise<ActionResult> {
  try {
    const v = syllabusExtractionSchema.safeParse(extraction);
    if (!v.success) return { ok: false, error: "The edited data is invalid." };
    const { supabase } = await authed();
    const { error } = await supabase.from("course_websites").update({ extracted: v.data }).eq("course_id", courseId);
    if (error) return { ok: false, error: dbError(error.message) };
    revalidatePath(`/courses/${courseId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const optionsSchema = z.object({
  updateCourse: z.boolean(), importCategories: z.boolean(),
  assignmentIdx: z.array(z.number().int().min(0)), dateIdx: z.array(z.number().int().min(0)), timeZone: z.string().max(64).default("UTC"),
});

/** Apply the reviewed website data: adds what's new, fills blanks, and corrects stale dates, never touching Canvas items or your own edits. */
export async function applyWebsite(courseId: string, extraction: unknown, options: z.input<typeof optionsSchema>): Promise<ActionResult<ApplyResult>> {
  try {
    const v = syllabusExtractionSchema.safeParse(extraction);
    const o = optionsSchema.safeParse(options);
    if (!v.success || !o.success) return { ok: false, error: "Invalid data." };
    const { supabase, user } = await authed();
    const { data: course } = await supabase.from("courses").select("id").eq("id", courseId).maybeSingle();
    if (!course) return { ok: false, error: "Course not found." };
    const r = await applyExtraction(supabase, user.id, courseId, v.data, o.data, "website");
    await supabase.from("course_websites").update({ extracted: v.data, last_applied_at: new Date().toISOString() }).eq("course_id", courseId);
    await logActivity(supabase, user.id, "website_applied", `Imported from course website: ${r.assignments} new, ${r.dateChanges} date change${r.dateChanges === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} already existed` : ""}`, courseId);
    revalidatePath("/", "layout");
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}
