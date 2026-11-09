import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { InfoRow } from "@/components/courses/course-info-panel";
import type { SiteRow } from "@/components/courses/website-panel";
import type { ChatMessage } from "@/components/assistant/assistant-chat";
import { cleanStored } from "@/lib/utils/errors";

/** Course-tab data. Each is cached per request and tolerates a missing table (migrations not yet applied). */

export const getCourseAnnouncements = cache(async (courseId: string) => {
  const s = await createClient();
  const { data, error } = await s.from("course_announcements").select("id, title, posted_at, url").eq("course_id", courseId).order("posted_at", { ascending: false }).limit(4);
  return error ? [] : data ?? [];
});

export const getCourseInfoRow = cache(async (courseId: string): Promise<InfoRow | null> => {
  const s = await createClient();
  const { data, error } = await s.from("course_info").select("status, error, info, raw, extracted_at, fetched_at").eq("course_id", courseId).maybeSingle();
  if (error || !data) return null;
  return { ...(data as InfoRow), error: data.error ? cleanStored(data.error) : null };
});

export const getCourseWebsite = cache(async (courseId: string): Promise<SiteRow | null> => {
  const s = await createClient();
  const { data, error } = await s.from("course_websites").select("url, status, error, pages, extracted, last_fetched_at, last_applied_at, updated_at").eq("course_id", courseId).maybeSingle();
  return error ? null : (data as SiteRow | null);
});

export const getCanvasMethod = cache(async (): Promise<"api" | "extension" | null> => {
  const s = await createClient();
  const { data, error } = await s.from("canvas_connections").select("auth_type").limit(1).maybeSingle();
  if (error || !data) return null;
  return data.auth_type === "extension" ? "extension" : "api";
});

/** Latest assistant conversation for the course WITH its messages: one round trip (embedded), not two. */
export const getCourseChat = cache(async (courseId: string): Promise<{ id: string | null; messages: ChatMessage[] }> => {
  const s = await createClient();
  const { data } = await s.from("ai_conversations").select("id, ai_messages(id, role, content, citations, created_at)").eq("course_id", courseId)
    .order("updated_at", { ascending: false }).limit(1).order("created_at", { referencedTable: "ai_messages" }).maybeSingle();
  const row = data as { id: string; ai_messages?: (ChatMessage & { created_at: string })[] } | null;
  return { id: row?.id ?? null, messages: (row?.ai_messages ?? []).map(({ id, role, content, citations }) => ({ id, role, content, citations })) };
});
