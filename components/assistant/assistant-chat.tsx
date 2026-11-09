"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Bot, FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; citations?: { type: string; label: string; href: string }[] | null; error?: boolean }
export interface ConversationRow { id: string; title: string; updated_at: string }

const SUGGESTIONS = [
  "What assignments do I have due this week?", "Which class should I prioritize this week?", "How busy is my upcoming week?",
  "What do I need on my final to get an A?", "Am I falling behind in any of my courses?", "What was added to Canvas recently?",
];
const COURSE_SUGGESTIONS = ["Summarize my syllabus.", "Explain the late submission policy.", "When is my next exam?", "What percentage of my grade is homework?", "What do I need on the final to get an A?"];

export function AssistantChat({ conversations, activeId, initialMessages, courses, lockedCourseId, basePath }: {
  conversations?: ConversationRow[]; activeId: string | null; initialMessages: ChatMessage[]; courses: { id: string; label: string }[]; lockedCourseId?: string; basePath: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [convId, setConvId] = useState<string | null>(activeId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [course, setCourse] = useState<string>(lockedCourseId ?? "");
  const end = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(activeId);
  if (seen !== activeId) { setSeen(activeId); setConvId(activeId); setMessages(initialMessages); }

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput(""); setBusy(true);
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: msg }]);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, conversationId: convId ?? undefined, courseId: course || null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: j.error ?? "Something went wrong.", error: true }]); if (j.conversationId && !convId) setConvId(j.conversationId); return; }
      setMessages((m) => [...m, j.message]);
      if (!convId) { setConvId(j.conversationId); router.replace(`${basePath}${basePath.includes("?") ? "&" : "?"}c=${j.conversationId}`, { scroll: false }); }
      router.refresh();
    } catch {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: "I couldn't reach the server. Check your connection and try again.", error: true }]);
    } finally { setBusy(false); }
  }

  const empty = messages.length === 0;
  const prompts = lockedCourseId ? COURSE_SUGGESTIONS : SUGGESTIONS;

  return (
    <div className={cn("grid gap-4", conversations ? "lg:grid-cols-[15rem_1fr]" : "")}>
      {conversations && (
        <aside className="hidden lg:block">
          <Button variant="outline" className="mb-3 w-full" onClick={() => { setConvId(null); setMessages([]); router.replace(basePath, { scroll: false }); }}><Plus /> New chat</Button>
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}><Link href={`${basePath}?c=${c.id}`} className={cn("block truncate rounded-md px-2.5 py-1.5 text-sm", c.id === convId ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{c.title}</Link></li>
            ))}
            {conversations.length === 0 && <li className="px-2 text-xs text-muted-foreground">Past chats appear here.</li>}
          </ul>
        </aside>
      )}

      <section className="flex min-h-[28rem] flex-col rounded-lg border bg-card" style={{ height: lockedCourseId ? "34rem" : "calc(100dvh - 12rem)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium"><Bot className="size-4 text-primary" /> Assistant</p>
          <div className="flex items-center gap-2">
            {!lockedCourseId && (
              <NativeSelect aria-label="Course context" className="h-8 w-auto text-xs" value={course} onChange={(e) => setCourse(e.target.value)}>
                <option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </NativeSelect>
            )}
            {conversations && <Button variant="outline" size="sm" className="lg:hidden" onClick={() => { setConvId(null); setMessages([]); router.replace(basePath, { scroll: false }); }}><Plus /> New</Button>}
            {lockedCourseId && !empty && <Button variant="outline" size="sm" onClick={() => { setConvId(null); setMessages([]); router.replace(basePath, { scroll: false }); }}><Plus /> New chat</Button>}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          {empty && (
            <div className="mx-auto mt-6 max-w-md text-center">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary"><Sparkles className="size-5" /></div>
              <p className="font-medium">Ask about your semester</p>
              <p className="mt-1 text-sm text-muted-foreground">Answers come from your own courses, deadlines, grades and syllabi. Grades are calculated by CoursePilot&apos;s grade engine, not guessed.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {prompts.map((p) => <button key={p} onClick={() => send(p)} className="rounded-full border px-3 py-1.5 text-xs hover:bg-accent cursor-pointer">{p}</button>)}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5", m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "border border-destructive/30 bg-red-500/5 text-destructive" : "bg-muted")}>
                {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.content}</p> : <Markdown text={m.content} />}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                    {m.citations.map((c) => (
                      <Link key={c.href + c.label} href={c.href} className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground hover:text-primary"><FileText className="size-3" />{c.label}</Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="flex"><div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking your data…</div></div>}
          <div ref={end} />
        </div>

        <form className="flex items-end gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} aria-label="Ask a question" placeholder="Ask about deadlines, grades, or your syllabus…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp /></Button>
        </form>
      </section>
    </div>
  );
}
