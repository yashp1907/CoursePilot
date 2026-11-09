"use server";

import { revalidatePath } from "next/cache";
import { authed, fail, logActivity, parse, type ActionResult } from "./helpers";
import { z } from "zod";
import { courseSchema, schemeSchema, type CourseInput, type SchemeInput } from "@/lib/validation";
import { isValidCourseColor } from "@/lib/utils/colors";
import { nextCourseOrder } from "@/lib/data/queries";

export async function createCourse(input: CourseInput): Promise<ActionResult<{ id: string }>> {
  try {
    const p = parse(courseSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const order = await nextCourseOrder();
    const { data, error } = await supabase.from("courses").insert({ ...p.data, user_id: user.id, ...(order !== null ? { sort_order: order } : {}) }).select("id").single();
    if (error) return { ok: false, error: error.message };
    await logActivity(supabase, user.id, "course_created", `Added course ${p.data.code ?? p.data.name}`, data.id);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function updateCourse(id: string, input: CourseInput): Promise<ActionResult> {
  try {
    const p = parse(courseSchema, input);
    if (!p.ok) return p;
    const { supabase } = await authed();
    const { error } = await supabase.from("courses").update(p.data).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { data: syl } = await supabase.from("syllabi").select("storage_path").eq("course_id", id).maybeSingle();
    if (syl?.storage_path) await supabase.storage.from("syllabi").remove([syl.storage_path]);
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/**
 * Replace the grading scheme for a course. Categories with an id are updated, ones without are created,
 * and categories omitted from the payload are removed (their assignments become uncategorized).
 */
export async function saveGradingScheme(courseId: string, input: SchemeInput): Promise<ActionResult> {
  try {
    const p = parse(schemeSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const s = p.data;

    const { error: ce } = await supabase.from("courses").update({ grading_mode: s.mode, grade_curve: s.curve, grade_scale: s.scale }).eq("id", courseId);
    if (ce) return { ok: false, error: ce.message };

    const { data: existing, error: ee } = await supabase.from("grading_categories").select("id").eq("course_id", courseId);
    if (ee) return { ok: false, error: ee.message };
    const keep = new Set(s.categories.map((c) => c.id).filter(Boolean) as string[]);
    const remove = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (remove.length) {
      const { error } = await supabase.from("grading_categories").delete().in("id", remove);
      if (error) return { ok: false, error: error.message };
    }
    for (const [i, c] of s.categories.entries()) {
      const row = { name: c.name, weight: c.weight, drop_lowest: c.drop_lowest, sort_order: i };
      const res = c.id
        ? await supabase.from("grading_categories").update(row).eq("id", c.id).eq("course_id", courseId)
        : await supabase.from("grading_categories").insert({ ...row, course_id: courseId, user_id: user.id });
      if (res.error) return { ok: false, error: res.error.message };
    }
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

const MIGRATION_HINT = "Apply the latest database migration (…0004_course_order.sql) to save course order.";

/** Persist the student's course order. `ids` is the full desired order. */
export async function reorderCourses(ids: string[]): Promise<ActionResult> {
  try {
    const p = z.array(z.string().uuid()).min(1).max(100).refine((a) => new Set(a).size === a.length, "Duplicate course in list.").safeParse(ids);
    if (!p.success) return { ok: false, error: "Invalid course list." };
    const { supabase } = await authed();
    const results = await Promise.all(p.data.map((id, i) => supabase.from("courses").update({ sort_order: i + 1 }).eq("id", id)));
    const bad = results.find((r) => r.error);
    if (bad?.error) return { ok: false, error: /sort_order/.test(bad.error.message) ? MIGRATION_HINT : bad.error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function updateCourseColor(id: string, color: string): Promise<ActionResult> {
  try {
    if (!z.string().uuid().safeParse(id).success || !isValidCourseColor(color)) return { ok: false, error: "Choose a valid color." };
    const { supabase } = await authed();
    const { error } = await supabase.from("courses").update({ color: color.toLowerCase() }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
