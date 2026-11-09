import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { runAssistant } from "@/lib/ai/assistant";
import { loadSnapshot } from "@/lib/ai/assistant-data";
import { GeminiConfigError } from "@/lib/ai/gemini";
import { userMessage } from "@/lib/utils/errors";

export const maxDuration = 60;

const body = z.object({
  message: z.string().trim().min(1, "Type a question first.").max(2000, "Please keep questions under 2,000 characters."),
  conversationId: z.string().uuid().optional(),
  courseId: z.string().uuid().nullable().optional(),
  timeZone: z.string().max(64).default("UTC"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const { message, courseId, timeZone } = parsed.data;

  // Light rate limiting from our own message table: protects the free Gemini quota.
  const now = Date.now();
  const [{ count: lastMin }, { count: lastDay }] = await Promise.all([
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", new Date(now - 60_000).toISOString()),
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", new Date(now - 86_400_000).toISOString()),
  ]);
  if ((lastMin ?? 0) >= 8) return NextResponse.json({ error: "You're asking quickly. Wait a few seconds and try again." }, { status: 429 });
  if ((lastDay ?? 0) >= 200) return NextResponse.json({ error: "Daily assistant limit reached. It resets within 24 hours." }, { status: 429 });

  let conversationId = parsed.data.conversationId;
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const { data: msgs } = await supabase.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12);
    history = ((msgs ?? []) as typeof history).reverse();
  } else {
    if (courseId) {
      const { data: c } = await supabase.from("courses").select("id").eq("id", courseId).maybeSingle();
      if (!c) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    const { data: created, error } = await supabase.from("ai_conversations").insert({ user_id: user.id, course_id: courseId ?? null, title: message.slice(0, 60) }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Couldn't start the conversation." }, { status: 500 });
    conversationId = created.id as string;
  }

  await supabase.from("ai_messages").insert({ user_id: user.id, conversation_id: conversationId, role: "user", content: message });

  try {
    const snapshot = await loadSnapshot(supabase, { timeZone, focusCourseId: courseId ?? null });
    const out = await runAssistant({ snapshot, history, message });
    const { data: saved } = await supabase.from("ai_messages").insert({ user_id: user.id, conversation_id: conversationId, role: "assistant", content: out.text, citations: out.citations }).select("id, created_at").single();
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return NextResponse.json({ conversationId, message: { id: saved?.id, role: "assistant", content: out.text, citations: out.citations, created_at: saved?.created_at } });
  } catch (e) {
    console.error("assistant failed", e);
    const msg = userMessage(e, "The assistant ran into a problem. Please try again.");
    return NextResponse.json({ error: msg, conversationId }, { status: e instanceof GeminiConfigError ? 503 : 502 });
  }
}
