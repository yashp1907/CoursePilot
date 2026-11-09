"use client";
import { useMemo, useState, useTransition } from "react";
import { addDays, format, isSameDay, isToday, isTomorrow, startOfDay } from "date-fns";
import { Circle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CourseChip } from "@/components/ui/course-chip";
import { cn } from "@/lib/utils";
import { courseHex, readable, tint } from "@/lib/utils/colors";
import { setAssignmentStatus } from "@/lib/actions/assignments";
import { run } from "@/lib/utils/action";
import { displayStatus, STATUS_LABEL } from "@/lib/utils/dates";
import type { Assignment, Course } from "@/types/database";

const PRI = { high: "danger", medium: "warning", low: "default" } as const;

type Group = "overdue" | "today" | "tomorrow" | "week" | "later" | "nodate";
const GROUP_LABEL: Record<Group, string> = { overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", week: "This week", later: "Later", nodate: "No due date" };

function groupOf(a: Assignment, now: Date): Group {
  if (!a.due_at) return "nodate";
  const d = new Date(a.due_at);
  if (d < now) return "overdue";
  if (isToday(d)) return "today";
  if (isTomorrow(d)) return "tomorrow";
  return d < addDays(startOfDay(now), 7) ? "week" : "later";
}

function dueText(a: Assignment, g: Group): string {
  if (!a.due_at) return "";
  const d = new Date(a.due_at);
  if (g === "today" || g === "tomorrow") return format(d, "h:mm a");
  if (g === "week") return format(d, "EEE, h:mm a");
  return format(d, "MMM d, h:mm a");
}

export function UpcomingDeadlines({ assignments, courses }: { assignments: Assignment[]; courses: Course[] }) {
  const [, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const byId = new Map(courses.map((c) => [c.id, c]));

  const groups = useMemo(() => {
    const now = new Date();
    const order: Group[] = ["overdue", "today", "tomorrow", "week", "later", "nodate"];
    const live = assignments.filter((a) => !gone.has(a.id));
    return order.map((g) => ({ g, items: live.filter((a) => groupOf(a, now) === g) })).filter((x) => x.items.length > 0);
  }, [assignments, gone]);

  if (groups.length === 0) return <p className="px-5 pb-6 text-sm text-muted-foreground">You&apos;re all caught up. Nothing is due soon. 🎉</p>;
  return (
    <div>
      {groups.map(({ g, items }) => (
        <section key={g} aria-label={GROUP_LABEL[g]}>
          <h3 className={cn("flex items-center gap-2 border-y bg-muted/40 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide", g === "overdue" ? "text-destructive" : "text-muted-foreground")}>
            {GROUP_LABEL[g]}<span className="font-medium normal-case tracking-normal opacity-70">{items.length}</span>
          </h3>
          <ul className="divide-y">
            {items.map((a) => {
              const c = byId.get(a.course_id); const st = displayStatus(a);
              return (
                <li key={a.id} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40" style={{ boxShadow: `inset 3px 0 0 ${courseHex(c?.color)}` }}>
                  <button aria-label={`Mark "${a.title}" complete`} className="text-muted-foreground transition hover:text-success cursor-pointer"
                    onClick={() => { setGone((s) => new Set(s).add(a.id)); start(async () => { const r = await run(setAssignmentStatus(a.id, "completed"), "Marked complete"); if (!r.ok) setGone((s) => { const n = new Set(s); n.delete(a.id); return n; }); }); }}>
                    <Circle className="size-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{a.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      <CourseChip color={c?.color} label={c?.code ?? c?.name ?? "Course"} />
                      {a.estimated_minutes ? <span>~{a.estimated_minutes >= 60 ? `${Math.round(a.estimated_minutes / 6) / 10}h` : `${a.estimated_minutes}m`}</span> : null}
                      {a.type === "exam" && <span className="font-medium" style={{ color: readable(c?.color) }}>★ Exam</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("text-sm font-medium tabular-nums", g === "overdue" && "text-destructive")}>{dueText(a, g)}</span>
                    <span className="flex items-center gap-1">
                      {st === "in_progress" && <Badge variant="primary">{STATUS_LABEL[st]}</Badge>}
                      {a.priority === "high" && <Badge variant={PRI.high}>High</Badge>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="px-5 py-3 text-right"><Link href="/assignments" className="text-sm font-medium text-primary hover:underline">View all assignments →</Link></div>
    </div>
  );
}

export function WeeklyOverview({ assignments, courses }: { assignments: Assignment[]; courses: Course[] }) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  return (
    <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4 lg:grid-cols-7">
      {days.map((d) => {
        const items = assignments.filter((a) => a.due_at && isSameDay(new Date(a.due_at), d));
        const now = isSameDay(d, today);
        return (
          <div key={d.toISOString()} className={cn("min-h-24 rounded-lg border p-2", now ? "border-primary/40 bg-primary-soft/40" : "bg-card")}>
            <p className="flex items-baseline justify-between text-xs"><span className={cn("font-semibold uppercase tracking-wide", now ? "text-primary" : "text-muted-foreground")}>{now ? "Today" : format(d, "EEE")}</span><span className={cn("text-sm font-semibold", now && "text-primary")}>{format(d, "d")}</span></p>
            <div className="mt-1.5 space-y-1">
              {items.slice(0, 2).map((a) => {
                const c = byId.get(a.course_id);
                return <p key={a.id} title={`${c?.code ?? ""} ${a.title}`} className={cn("line-clamp-2 break-words rounded px-1.5 py-0.5 text-xs font-medium leading-snug", ["completed", "submitted"].includes(a.status) && "line-through opacity-50")} style={{ backgroundColor: tint(c?.color, 16), color: readable(c?.color), boxShadow: `inset 2px 0 0 ${courseHex(c?.color)}` }}>{a.type === "exam" ? "★ " : ""}{a.title}</p>;
              })}
              {items.length > 2 && <p className="px-1 text-xs text-muted-foreground">+{items.length - 2} more</p>}
              {items.length === 0 && <p className="px-1 text-xs text-muted-foreground/70">Free</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
