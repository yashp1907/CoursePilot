"use client";
import { useMemo, useState, useTransition } from "react";
import { addDays, format } from "date-fns";
import { AlertTriangle, CheckCircle2, Circle, ListChecks, Save, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { CourseChip } from "@/components/ui/course-chip";
import { courseHex, readable, tint } from "@/lib/utils/colors";
import { cn } from "@/lib/utils";
import { deleteStudyTask, saveAvailability, toggleStudyTask } from "@/lib/actions/planner";
import { run } from "@/lib/utils/action";
import { estimateMinutes, isOpen, rankAssignments } from "@/lib/planner/priority";
import { availabilityFor, dayKey, planWeek, type PlanTask } from "@/lib/planner/schedule";
import { describeWeek, weeklyWorkload } from "@/lib/planner/workload";
import { formatDue } from "@/lib/utils/dates";
import { BreakdownDialog } from "./breakdown-dialog";
import type { Assignment, Course, GradingCategoryRow, StudyTask } from "@/types/database";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hm = (m: number) => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h${Math.round(m % 60) ? ` ${Math.round(m % 60)}m` : ""}`);

export function PlannerView({ assignments, courses, categories, studyTasks, weeklyHours, availability }: {
  assignments: Assignment[]; courses: Course[]; categories: GradingCategoryRow[]; studyTasks: StudyTask[]; weeklyHours: number; availability: number[] | null;
}) {
  const [pending, start] = useTransition();
  const [offset, setOffset] = useState(0);
  const [avail, setAvail] = useState<string[]>(() => (availability ?? Array(7).fill(weeklyHours / 7)).map((h) => String(Math.round(h * 10) / 10)));
  const [target, setTarget] = useState<Assignment | null>(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [now] = useState(() => new Date());

  const byCourse = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const weight = (a: Assignment) => { const w = categories.find((c) => c.id === a.category_id)?.weight; return w ? Number(w) : null; };
  const open = useMemo(() => assignments.filter((a) => isOpen(a) && a.type !== "study"), [assignments]);
  const tasksFor = (id: string) => studyTasks.filter((t) => t.assignment_id === id);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(addDays(now, offset * 7 + i), tz)), [now, offset, tz]);
  const perWeekday = avail.map((v) => Math.max(0, Number(v) || 0));
  const weeklyTotal = perWeekday.reduce((s, h) => s + h, 0);
  const capacity = availabilityFor(dates, weeklyHours, perWeekday);

  // Work to plan: open items due within 3 weeks (or overdue). A saved breakdown replaces the single estimate.
  const tasks: PlanTask[] = useMemo(() => {
    const horizon = +now + 21 * 86_400_000;
    return open.filter((a) => !a.due_at || +new Date(a.due_at) <= horizon).flatMap((a): PlanTask[] => {
      const c = byCourse.get(a.course_id)?.code ?? "";
      const steps = tasksFor(a.id).filter((t) => !t.done);
      const prio = rankAssignments([a], now, weight)[0]?.score ?? 0;
      if (steps.length) return steps.map((t) => ({ id: t.id, title: `${c} ${a.title}: ${t.title}`.trim(), courseId: a.course_id, minutes: t.estimated_minutes ?? 30, due: a.due_at, priority: prio }));
      if (studyTasks.some((t) => t.assignment_id === a.id)) return []; // every step done
      return [{ id: a.id, title: `${c} ${a.title}`.trim(), courseId: a.course_id, minutes: estimateMinutes(a).minutes, due: a.due_at, priority: prio }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studyTasks, now, byCourse, categories]);

  const plan = useMemo(() => planWeek(tasks, dates, capacity, tz), [tasks, dates, capacity, tz]);
  const ranked = useMemo(() => rankAssignments(open, now, weight).slice(0, 6), [open, now, categories]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeks = useMemo(() => weeklyWorkload(assignments, now, 4, tz, weeklyTotal * 60), [assignments, now, tz, weeklyTotal]);
  const totalPlanned = plan.days.reduce((s, d) => s + d.usedMinutes, 0);
  const totalCapacity = capacity.reduce((s, m) => s + m, 0);
  const usesDefault = open.some((a) => !a.estimated_minutes && tasksFor(a.id).length === 0);
  const dueInWindow = open.filter((a) => a.due_at && dayKey(new Date(a.due_at), tz) >= dates[0] && dayKey(new Date(a.due_at), tz) <= dates[6]);
  const label = (id: string | null) => (id ? byCourse.get(id) : undefined);

  if (courses.length === 0) return <EmptyState icon={<Sparkles />} title="Add a course to start planning" description="The planner uses your real assignments and exam dates. Add a course and some assignments (or sync Canvas) first." />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-4"><p className="text-xs font-medium text-muted-foreground">Due {offset === 0 ? "in the next 7 days" : "the following 7 days"}</p><p className="mt-1 text-2xl font-semibold">{dueInWindow.length}</p><p className="text-xs text-muted-foreground">{dueInWindow.filter((a) => a.type === "exam").length} exam{dueInWindow.filter((a) => a.type === "exam").length === 1 ? "" : "s"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs font-medium text-muted-foreground">Work to schedule</p><p className="mt-1 text-2xl font-semibold">{hm(tasks.reduce((s, t) => s + t.minutes, 0))}</p><p className="text-xs text-muted-foreground">{usesDefault ? "Some items use default estimates" : "Based on your estimates"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs font-medium text-muted-foreground">Time available</p><p className="mt-1 text-2xl font-semibold">{hm(totalCapacity)}</p><p className="text-xs text-muted-foreground">{hm(totalPlanned)} planned this week</p></CardContent></Card>
      </div>

      {plan.atRisk.length > 0 && (
        <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div><p className="font-medium">Not enough time before {plan.atRisk.length === 1 ? "a deadline" : "some deadlines"}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">{plan.atRisk.slice(0, 4).map((r) => <li key={r.taskId}>{r.title}: about {hm(r.shortfallMinutes)} short</li>)}</ul>
            <p className="mt-1 text-xs text-muted-foreground">Free up time in your availability below, or re-prioritize.</p></div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div><CardTitle>Your plan</CardTitle><CardDescription>Earliest deadlines first, within the hours you have available each day.</CardDescription></div>
          <div className="flex gap-1"><Button size="sm" variant={offset === 0 ? "soft" : "outline"} onClick={() => setOffset(0)}>Next 7 days</Button><Button size="sm" variant={offset === 1 ? "soft" : "outline"} onClick={() => setOffset(1)}>Following week</Button></div>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to plan. You have no open assignments due in the next three weeks.</p> : (
            <div className="grid gap-2 md:grid-cols-7">
              {plan.days.map((d) => (
                <div key={d.date} className="rounded-lg border bg-card p-2 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-medium">{format(new Date(`${d.date}T12:00:00`), "EEE d")}</p>
                  <p className="mb-1.5 text-xs text-muted-foreground">{hm(d.usedMinutes)} of {hm(d.capacityMinutes)}</p>
                  <div className="space-y-1">
                    {d.blocks.length === 0 && <p className="text-xs text-muted-foreground">Free</p>}
                    {d.blocks.map((b, i) => { const col = byCourse.get(tasks.find((t) => t.id === b.taskId)?.courseId ?? "")?.color; return <p key={i} className="break-words rounded px-1.5 py-1 text-xs leading-snug" style={{ backgroundColor: tint(col, 15), color: readable(col), boxShadow: `inset 2px 0 0 ${courseHex(col)}` }}>{b.title}<span className="block opacity-70">{hm(b.minutes)}</span></p>; })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Set when you can study</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-7 gap-2">
                {DOW.map((d, i) => (<label key={d} className="space-y-1 text-center text-xs text-muted-foreground">{d}<Input aria-label={`${d} hours`} type="number" min="0" max="24" step="0.5" className="px-1.5 text-center" value={avail[i]} onChange={(e) => setAvail((a) => a.map((v, j) => (j === i ? e.target.value : v)))} /></label>))}
              </div>
              <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{weeklyTotal} hours per week in total.</p>
                <Button size="sm" loading={pending} onClick={() => start(async () => { await run(saveAvailability(perWeekday), "Availability saved"); })}><Save /> Save availability</Button></div>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Suggested priorities</CardTitle><CardDescription>Scored from due date, workload, exam/grade weight and your own priority.</CardDescription></div></CardHeader>
          <CardContent>
            {ranked.length === 0 ? <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p> : (
              <ol className="space-y-3">
                {ranked.map((r, i) => {
                  const c = label(r.assignment.course_id);
                  return (
                    <li key={r.assignment.id} className="flex gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.assignment.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><CourseChip color={c?.color} label={c?.code ?? c?.name ?? "Course"} /> {formatDue(r.assignment.due_at)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{r.reasons.join(" · ")}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setTarget(r.assignment)}><ListChecks /> Break down</Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Workload by week</CardTitle><CardDescription>Open exams and assignments by the week they&apos;re due.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            {weeks.map((w) => {
              const max = Math.max(...weeks.map((x) => x.minutes), 1);
              return (
                <div key={w.start}>
                  <div className="flex items-center justify-between text-sm"><span className="font-medium">{w.label}</span>{w.busy && <Badge variant="warning">Busy</Badge>}</div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", w.busy ? "bg-warning" : "bg-primary")} style={{ width: `${(w.minutes / max) * 100}%` }} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{describeWeek(w) ?? "Nothing due."}{w.minutes ? ` About ${hm(w.minutes)} of work.` : ""}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {studyTasks.length > 0 && (
        <Card>
          <CardHeader><div><CardTitle>Your task breakdowns</CardTitle><CardDescription>Steps you saved for bigger assignments.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            {[...new Set(studyTasks.map((t) => t.assignment_id))].map((aid) => {
              const a = assignments.find((x) => x.id === aid); if (!a) return null;
              const ts = tasksFor(a.id);
              return (
                <div key={a.id}>
                  <div className="mb-1 flex items-center justify-between"><p className="text-sm font-medium">{a.title} <span className="font-normal text-muted-foreground">· {ts.filter((t) => t.done).length}/{ts.length} done</span></p><Button size="sm" variant="ghost" onClick={() => setTarget(a)}>Edit steps</Button></div>
                  <ul className="divide-y rounded-md border">
                    {ts.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <button aria-label={t.done ? "Mark not done" : "Mark done"} className="cursor-pointer" onClick={() => start(async () => { await run(toggleStudyTask(t.id, !t.done)); })}>{t.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}</button>
                        <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>{t.title}</span>
                        <span className="text-xs text-muted-foreground">{t.estimated_minutes ? hm(t.estimated_minutes) : ""}</span>
                        <button aria-label="Delete step" className="text-xs text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => start(async () => { await run(deleteStudyTask(t.id)); })}>✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <BreakdownDialog assignment={target} existing={target ? tasksFor(target.id) : []} onClose={() => setTarget(null)} />
    </div>
  );
}
