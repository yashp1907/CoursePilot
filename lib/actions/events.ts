"use server";

import { revalidatePath } from "next/cache";
import { authed, fail, parse, type ActionResult } from "./helpers";
import { eventSchema } from "@/lib/validation";
import type { z } from "zod";

export async function createEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  try {
    const p = parse(eventSchema, input);
    if (!p.ok) return p;
    const { supabase, user } = await authed();
    const { error } = await supabase.from("calendar_events").insert({ ...p.data, user_id: user.id, source: "manual" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
