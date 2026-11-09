"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, fail, type ActionResult } from "./helpers";

const taskSchema = z.object({ title: z.string().trim().min(1, "Each step needs a title.").max(300), minutes: z.number().int().min(5, "Steps should be at least 5 minutes.").max(1440) });

/** Replace the not-yet-done steps of an assignment's breakdown (completed steps are kept). */
export async function saveStudyTasks(assignmentId: string, tasks: { title: string; minutes: number }[]): Promise<ActionResult<{ count: number }>> {
  try {
    const parsed = z.array(taskSchema).max(20, "Keep it to 20 steps or fewer.").safeParse(tasks);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const { supabase, user } = await authed();
    const { data: a } = await supabase.from("assignments").select("id, course_id").eq("id", assignmentId).maybeSingle();
    if (!a) return { ok: false, error: "Assignment not found." };
    const del = await supabase.from("study_tasks").delete().eq("assignment_id", assignmentId).eq("done", false);
    if (del.error) return { ok: false, error: del.error.message };
    if (parsed.data.length) {
      const { count } = await supabase.from("study_tasks").select("id", { count: "exact", head: true }).eq("assignment_id", assignmentId);
      const { error } = await supabase.from("study_tasks").insert(parsed.data.map((t, i) => ({
        user_id: user.id, assignment_id: assignmentId, course_id: a.course_id, title: t.title, estimated_minutes: t.minutes, done: false, scheduled_for: null, sort_order: (count ?? 0) + i,
      })));
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/planner");
    return { ok: true, data: { count: parsed.data.length } };
  } catch (e) { return fail(e); }
}

export async function toggleStudyTask(id: string, done: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("study_tasks").update({ done }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/planner");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteStudyTask(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("study_tasks").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/planner");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function saveAvailability(hours: number[] | null): Promise<ActionResult> {
  try {
    const p = z.array(z.number().min(0).max(24)).length(7).nullable().safeParse(hours);
    if (!p.success) return { ok: false, error: "Enter 0-24 hours for each day." };
    const { supabase, user } = await authed();
    const { error } = await supabase.from("user_settings").update({ availability: p.data }).eq("user_id", user.id);
    if (error) return { ok: false, error: /availability/.test(error.message) ? "Apply the latest database migration (…0002) to save availability." : error.message };
    revalidatePath("/planner");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
