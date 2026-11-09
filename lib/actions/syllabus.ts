"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, fail, logActivity, type ActionResult } from "./helpers";
import { applyExtraction, type ApplyResult } from "@/lib/server/apply-extraction";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";

/** Persist the user's edits to the extracted data (does not touch the course). */
export async function saveSyllabusExtraction(courseId: string, extraction: unknown): Promise<ActionResult> {
  try {
    const v = syllabusExtractionSchema.safeParse(extraction);
    if (!v.success) return { ok: false, error: "The edited syllabus data is invalid." };
    const { supabase } = await authed();
    const { error } = await supabase.from("syllabi").update({ extracted: v.data, status: "extracted" }).eq("course_id", courseId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/courses/${courseId}`);
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const optionsSchema = z.object({
  updateCourse: z.boolean(),
  importCategories: z.boolean(),
  /** Indexes into extraction.assignments to import. */
  assignmentIdx: z.array(z.number().int().min(0)),
  /** Indexes into extraction.important_dates to import. */
  dateIdx: z.array(z.number().int().min(0)),
  /** The student's IANA timezone, so "due 11:59 PM" lands at the right instant. */
  timeZone: z.string().max(64).default("UTC"),
});
export type ApplyOptions = z.input<typeof optionsSchema>;
export type { ApplyResult };

/**
 * Write reviewed syllabus data into the course (shared logic in applyExtraction): nothing is deleted, and nothing
 * already in the course (Canvas, earlier imports, manual) is added a second time.
 */
export async function applySyllabus(courseId: string, extraction: unknown, options: ApplyOptions): Promise<ActionResult<ApplyResult>> {
  try {
    const v = syllabusExtractionSchema.safeParse(extraction);
    const o = optionsSchema.safeParse(options);
    if (!v.success || !o.success) return { ok: false, error: "Invalid syllabus data." };
    const { supabase, user } = await authed();
    const { data: course } = await supabase.from("courses").select("id").eq("id", courseId).single();
    if (!course) return { ok: false, error: "Course not found." };
    const r = await applyExtraction(supabase, user.id, courseId, v.data, o.data, "syllabus");
    await supabase.from("syllabi").update({ extracted: v.data, status: "applied", applied_at: new Date().toISOString() }).eq("course_id", courseId);
    await logActivity(supabase, user.id, "syllabus_applied", `Applied syllabus: ${r.assignments} assignments, ${r.events} dates, ${r.categories} grading categories${r.skipped ? ` (${r.skipped} already existed)` : ""}`, courseId);
    revalidatePath("/", "layout");
    return { ok: true, data: r };
  } catch (e) { return fail(e); }
}
