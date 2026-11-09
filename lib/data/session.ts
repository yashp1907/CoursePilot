import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import type { Profile, UserSettings } from "@/types/database";

export const getUser = cache(async () => {
  const supabase = await createClient();
  return getAuthUser(supabase);
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

export const getSettings = cache(async (): Promise<UserSettings | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();
  return (data as UserSettings | null) ?? null;
});
