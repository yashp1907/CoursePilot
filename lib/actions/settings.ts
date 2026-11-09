"use server";

import { revalidatePath } from "next/cache";
import { authed, fail, parse, type ActionResult } from "./helpers";
import { profileSchema, settingsSchema } from "@/lib/validation";
import type { z } from "zod";

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const p = parse(profileSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const { error } = await supabase.from("profiles").update(p.data).eq("id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function updateSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  try {
    const p = parse(settingsSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const { error } = await supabase.from("user_settings").update(p.data).eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
