import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { AssistantChat, type ChatMessage } from "@/components/assistant/assistant-chat";
import { createClient } from "@/lib/supabase/server";
import { listCourses } from "@/lib/data/queries";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const supabase = await createClient();
  const [courses, convs] = await Promise.all([listCourses(), supabase.from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30)]);
  const active = c && /^[0-9a-f-]{36}$/i.test(c) ? c : null;
  let messages: ChatMessage[] = [];
  if (active) {
    const { data } = await supabase.from("ai_messages").select("id, role, content, citations").eq("conversation_id", active).order("created_at");
    messages = (data ?? []) as ChatMessage[];
  }
  return (
    <>
      <PageHeader title="AI Assistant" description="Ask about deadlines, grades, and your syllabi. Answers use your real data." />
      <AssistantChat conversations={convs.data ?? []} activeId={messages.length || active ? active : null} initialMessages={messages} courses={courses.map((x) => ({ id: x.id, label: x.code ?? x.name }))} basePath="/assistant" />
    </>
  );
}
