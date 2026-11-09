"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, fail, logActivity, type ActionResult } from "./helpers";
import { mergePatch, pairKey } from "@/lib/duplicates";
import type { Assignment } from "@/types/database";

const ids = z.object({ keepId: z.string().uuid(), dropId: z.string().uuid(), kind: z.enum(["match", "covered"]).default("match") });

/**
 * Merge a syllabus/manual look-alike into the Canvas assignment it duplicates. Safety rules enforced here, not
 * just in the UI: the kept item must be Canvas-linked, the removed one must NOT be, and both must be in one course.
 */
export async function mergeDuplicate(keepId: string, dropId: string, kind: "match" | "covered" = "match"): Promise<ActionResult> {
  try {
    const p = ids.safeParse({ keepId, dropId, kind });
    if (!p.success || keepId === dropId) return { ok: false, error: "Invalid selection." };
    const { supabase, user } = await authed();
    const { data: rows } = await supabase.from("assignments").select("*").in("id", [keepId, dropId]);
    const keep = rows?.find((r) => r.id === keepId) as Assignment | undefined, drop = rows?.find((r) => r.id === dropId) as Assignment | undefined;
    if (!keep || !drop) return { ok: false, error: "One of the assignments no longer exists." };
    if (keep.course_id !== drop.course_id) return { ok: false, error: "These are in different courses." };
    if (!keep.canvas_assignment_id || drop.canvas_assignment_id) return { ok: false, error: "Only a syllabus or manual item can be merged into a Canvas assignment." };

    if (p.data.kind === "match") {
      const { data: gr } = await supabase.from("assignment_grades").select("assignment_id, points_earned, excused").in("assignment_id", [keepId, dropId]);
      const kg = gr?.find((g) => g.assignment_id === keepId), dg = gr?.find((g) => g.assignment_id === dropId);
      const { patch, moveGrade } = mergePatch(keep, drop, kg, dg);
      if (moveGrade) {
        const { error } = await supabase.from("assignment_grades").update({ assignment_id: keepId }).eq("assignment_id", dropId);
        if (error) return { ok: false, error: error.message };
      }
      if (Object.keys(patch).length) {
        const { error } = await supabase.from("assignments").update(patch).eq("id", keepId);
        if (error) return { ok: false, error: error.message };
      }
      await supabase.from("study_tasks").update({ assignment_id: keepId }).eq("assignment_id", dropId);
    }
    const { error } = await supabase.from("assignments").delete().eq("id", dropId);
    if (error) return { ok: false, error: error.message };
    await supabase.from("assignment_history").insert({ user_id: user.id, assignment_id: keepId, field: "merged_duplicate", old_value: drop.title, new_value: keep.title, source: "manual" });
    await logActivity(supabase, user.id, "assignment_merged", `Merged duplicate "${drop.title}" into "${keep.title}"`, keep.course_id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** "These are different assignments": remember it so the pair isn't suggested again. */
export async function dismissDuplicate(courseId: string, a: string, b: string): Promise<ActionResult> {
  try {
    if (!z.string().uuid().safeParse(courseId).success) return { ok: false, error: "Invalid course." };
    const { supabase } = await authed();
    const { data: c } = await supabase.from("courses").select("settings").eq("id", courseId).maybeSingle();
    if (!c) return { ok: false, error: "Course not found." };
    const settings = (c.settings ?? {}) as { dismissed_pairs?: string[] };
    const next = Array.from(new Set([...(settings.dismissed_pairs ?? []), pairKey(a, b)])).slice(-200);
    const { error } = await supabase.from("courses").update({ settings: { ...settings, dismissed_pairs: next } }).eq("id", courseId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
