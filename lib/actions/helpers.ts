import "server-only";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { userMessage } from "@/lib/utils/errors";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function authed() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) throw new Error("You need to log in again.");
  return { supabase, user };
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): { ok: true; data: z.infer<S> } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
}

export function fail(e: unknown): { ok: false; error: string } {
  console.error("action failed", e);
  return { ok: false, error: userMessage(e) };
}

export async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, kind: string, message: string, courseId?: string | null,
) {
  await supabase.from("activity_log").insert({ user_id: userId, kind, message, course_id: courseId ?? null });
}
