"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, fail, logActivity, parse, type ActionResult } from "./helpers";
import { assignmentSchema, type AssignmentInput } from "@/lib/validation";

const EDITABLE = ["title", "description", "type", "due_at", "estimated_minutes", "priority", "status", "points_possible", "category_id", "is_extra_credit"] as const;

export async function createAssignment(input: AssignmentInput): Promise<ActionResult<{ id: string }>> {
  try {
    const p = parse(assignmentSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const done = p.data.status === "completed" || p.data.status === "submitted";
    const { data, error } = await supabase
      .from("assignments")
      .insert({ ...p.data, user_id: user.id, source: "manual", completed_at: done ? new Date().toISOString() : null })
      .select("id").single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

export async function updateAssignment(id: string, input: AssignmentInput): Promise<ActionResult> {
  try {
    const p = parse(assignmentSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const { data: prev, error: pe } = await supabase.from("assignments").select("*").eq("id", id).single();
    if (pe || !prev) return { ok: false, error: "Assignment not found." };

    // Record which fields the user changed so a future Canvas sync won't overwrite them.
    const changed = EDITABLE.filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify((p.data as Record<string, unknown>)[k] ?? null));
    const edited = Array.from(new Set([...(prev.user_edited_fields ?? []), ...changed]));
    const done = p.data.status === "completed" || p.data.status === "submitted";
    const completed_at = done ? prev.completed_at ?? new Date().toISOString() : null;

    const { error } = await supabase.from("assignments").update({ ...p.data, user_edited_fields: edited, completed_at }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (!done && prev.status !== p.data.status) await logActivity(supabase, user.id, "assignment_updated", `Updated "${p.data.title}"`, p.data.course_id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function setAssignmentStatus(id: string, status: string): Promise<ActionResult> {
  try {
    const s = z.enum(["not_started", "in_progress", "completed", "submitted"]).safeParse(status);
    if (!s.success) return { ok: false, error: "Invalid status." };
    const { supabase, user } = await authed();
    const { data: prev } = await supabase.from("assignments").select("title, course_id, status, completed_at, user_edited_fields").eq("id", id).single();
    if (!prev) return { ok: false, error: "Assignment not found." };
    const done = s.data === "completed" || s.data === "submitted";
    const { error } = await supabase.from("assignments").update({
      status: s.data,
      completed_at: done ? prev.completed_at ?? new Date().toISOString() : null,
      user_edited_fields: Array.from(new Set([...(prev.user_edited_fields ?? []), "status"])),
    }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (done && prev.status !== s.data) await logActivity(supabase, user.id, "assignment_completed", `${s.data === "submitted" ? "Submitted" : "Completed"} "${prev.title}"`, prev.course_id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

/** Set (or clear, with null) the score for an assignment. */
export async function setAssignmentGrade(assignmentId: string, pointsEarned: number | null, excused = false): Promise<ActionResult> {
  try {
    const p = z.object({ id: z.string().uuid(), pts: z.number().min(0).max(100000).nullable(), excused: z.boolean() }).safeParse({ id: assignmentId, pts: pointsEarned, excused });
    if (!p.success) return { ok: false, error: "Enter a valid score (0 or more)." };
    const { supabase, user } = await authed();
    const { data: a } = await supabase.from("assignments").select("title, course_id").eq("id", assignmentId).single();
    if (!a) return { ok: false, error: "Assignment not found." };
    if (p.data.pts === null && !p.data.excused) {
      const { error } = await supabase.from("assignment_grades").delete().eq("assignment_id", assignmentId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("assignment_grades").upsert(
        { user_id: user.id, assignment_id: assignmentId, points_earned: p.data.pts, excused: p.data.excused, graded_at: new Date().toISOString(), source: "manual" },
        { onConflict: "assignment_id" },
      );
      if (error) return { ok: false, error: error.message };
      await logActivity(supabase, user.id, "grade_updated", `Recorded grade for "${a.title}"`, a.course_id);
    }
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
