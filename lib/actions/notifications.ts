"use server";

import { revalidatePath } from "next/cache";
import { authed, fail, type ActionResult } from "./helpers";
import { generateNotifications } from "@/lib/notifications";
import type { Assignment, Course, UserSettings } from "@/types/database";

export async function refreshNotifications(): Promise<ActionResult<{ created: number }>> {
  try {
    const { supabase, user } = await authed();
    const [{ data: a }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("assignments").select("*").not("due_at", "is", null).neq("status", "completed").neq("status", "submitted"),
      supabase.from("courses").select("*"),
      supabase.from("user_settings").select("*").maybeSingle(),
    ]);
    const prefs = (s as UserSettings | null) ?? { notify_deadlines: true, notify_overdue: true, notify_exams: true, deadline_lead_hours: 24 };
    const drafts = generateNotifications(new Date(), (a ?? []) as Assignment[], (c ?? []) as Course[], prefs);
    if (drafts.length) {
      const { data, error } = await supabase.from("notifications").upsert(drafts.map((d) => ({ user_id: user.id, ...d })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
      if (error) return { ok: false, error: error.message };
      if (data?.length) revalidatePath("/", "layout");
      return { ok: true, data: { created: data?.length ?? 0 } };
    }
    return { ok: true, data: { created: 0 } };
  } catch (e) { return fail(e); }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
