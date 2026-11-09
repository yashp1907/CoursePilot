import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, BookOpen, CalendarClock, CheckCircle2, ClipboardList, GraduationCap, Info, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/courses/course-card";
import { UpcomingDeadlines, WeeklyOverview } from "@/components/dashboard/deadlines";
import { Hero, type NextUp } from "@/components/dashboard/hero";
import { TodayClasses } from "@/components/dashboard/today-classes";
import { createClient } from "@/lib/supabase/server";
import { courseInfoSchema } from "@/lib/course-info/schemas";
import { listActivity, listAssignments, listCategories, listCourses, listGrades } from "@/lib/data/queries";
import { getProfile } from "@/lib/data/session";
import { summarizeCourses } from "@/lib/course-stats";
import { computeDashboard } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const TONES = {
  primary: "bg-primary-soft text-primary", amber: "bg-amber-500/12 text-warning", red: "bg-red-500/12 text-destructive",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400", green: "bg-green-500/12 text-success", muted: "bg-muted text-muted-foreground",
} as const;

function Stat({ icon: Icon, label, value, sub, tone, href }: { icon: typeof BookOpen; label: string; value: string | number; sub?: string; tone: keyof typeof TONES; href?: string }) {
  const body = (
    <Card className="spotlight h-full transition-all hover:-translate-y-px hover:shadow-[var(--shadow-lift)]"><CardContent className="flex items-center gap-3 p-3.5 sm:gap-3.5 sm:p-4">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11", TONES[tone])}><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold leading-tight tracking-tight tabular-nums">
          {typeof value === "number" ? <><span className="countup" style={{ "--to": value } as React.CSSProperties} aria-hidden /><span className="sr-only">{value}</span></> : value}
        </p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </CardContent></Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [courses, categories, assignments, grades, activity, profile, { data: infoRows, error: infoErr }] = await Promise.all([
    listCourses(), listCategories(), listAssignments(), listGrades(), listActivity(5), getProfile(),
    supabase.from("course_info").select("course_id, info"),
  ]);
  const classItems = infoErr ? [] : (infoRows ?? []).flatMap((r) => { const p = r.info ? courseInfoSchema.safeParse(r.info) : null; return p?.success && p.data.meetings.length ? [{ courseId: r.course_id as string, meetings: p.data.meetings }] : []; });
  const now = new Date();
  const summaries = summarizeCourses(courses, categories, assignments, grades, profile?.grade_scale_preset ?? null, now);
  const d = computeDashboard(assignments, summaries, now);
  const open = assignments.filter((a) => a.due_at && a.status !== "completed" && a.status !== "submitted");
  const upcoming = open.filter((a) => new Date(a.due_at!) >= new Date(+now - 7 * 86_400_000)).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!)).slice(0, 8);
  const weekItems = assignments.filter((a) => a.due_at && new Date(a.due_at) >= new Date(+now - 86_400_000) && new Date(a.due_at) <= new Date(+now + 8 * 86_400_000));
  const first = profile?.full_name?.split(" ")[0];
  const urgent = [...d.overdue].sort((x, y) => +new Date(x.due_at!) - +new Date(y.due_at!))[0] ?? upcoming.find((a) => new Date(a.due_at!) >= now);
  const uc = urgent ? courses.find((c) => c.id === urgent.course_id) : undefined;
  const nextUp: NextUp | null = urgent && urgent.due_at ? { title: urgent.title, dueAt: urgent.due_at, type: urgent.type, courseLabel: uc?.code ?? uc?.name ?? "Course", color: uc?.color ?? "blue" } : null;

  return (
    <>
      <Hero name={first} overdueCount={d.overdue.length} next={nextUp}
        summary={courses.length === 0 ? "Your entire semester, under control." : d.overdue.length > 0 ? <><span className="font-medium text-destructive">{d.overdue.length} overdue</span> · start there{d.dueThisWeek.length > 0 ? `, then ${d.dueThisWeek.length} due this week` : ""}.</> : d.dueThisWeek.length > 0 ? <>{d.dueThisWeek.length} thing{d.dueThisWeek.length === 1 ? "" : "s"} due in the next 7 days{profile?.current_semester ? ` · ${profile.current_semester}` : ""}.</> : "You're all caught up for the week."} />
      <div className="h-5" />

      {courses.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="Let's set up your semester" description="Add your first course, or upload a syllabus and CoursePilot will pull out the grading breakdown and exam dates. Want to look around first? Load demo data from Settings."
          action={<div className="flex gap-2"><Button asChild><Link href="/courses">Add a course</Link></Button><Button asChild variant="outline"><Link href="/settings">Load demo data</Link></Button></div>} />
      ) : (
        <div className="space-y-5 stagger">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1">
            <Stat icon={BookOpen} label="Active courses" value={d.activeCourses} tone="primary" href="/courses" />
            <Stat icon={ClipboardList} label="Due this week" value={d.dueThisWeek.length} sub="next 7 days" tone="amber" href="/assignments" />
            <Stat icon={AlertTriangle} label="Overdue" value={d.overdue.length} sub={d.overdue.length ? "needs attention" : "all clear"} tone={d.overdue.length ? "red" : "muted"} href="/assignments" />
            <Stat icon={CalendarClock} label="Upcoming exams" value={d.exams.length} tone="violet" href="/calendar" />
            <Stat icon={GraduationCap} label="GPA (current)" value={d.gpa ? d.gpa.gpa.toFixed(2) : "–"} sub={d.gpa ? `from ${d.gpa.counted} course${d.gpa.counted === 1 ? "" : "s"}` : "needs credits + grades"} tone="green" href="/grades" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader><div><CardTitle className="text-base">Upcoming deadlines</CardTitle><CardDescription>Tap the circle to mark one completed.</CardDescription></div></CardHeader>
                <UpcomingDeadlines assignments={upcoming} courses={courses} />
              </Card>
              <Card>
                <CardHeader><div><CardTitle>This week</CardTitle><CardDescription>Next 7 days. ★ marks an exam.</CardDescription></div><Link href="/calendar" className="text-xs font-medium text-primary hover:underline">Open calendar</Link></CardHeader>
                <WeeklyOverview assignments={weekItems} courses={courses} />
              </Card>
            </div>
            <div className="space-y-5">
              <TodayClasses items={classItems} courses={courses.map((c) => ({ id: c.id, label: c.code ?? c.name, color: c.color }))} />
              <Card>
                <CardHeader><CardTitle>Academic insights</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  {d.insights.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p> : d.insights.map((i) => (
                    <Link key={i.id} href={i.href ?? "#"} className="flex gap-2.5 rounded-md border p-2.5 hover:bg-accent/50">
                      {i.tone === "info" ? <Info className="mt-0.5 size-4 shrink-0 text-primary" /> : <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", i.tone === "danger" ? "text-destructive" : "text-warning")} />}
                      <div><p className="text-sm font-medium">{i.title}</p><p className="text-xs text-muted-foreground">{i.detail}</p></div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
                <CardContent>
                  {activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
                    <ul className="space-y-2.5">{activity.map((a) => (
                      <li key={a.id} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div><p>{a.message}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p></div></li>
                    ))}</ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold tracking-tight">Your courses <span className="text-sm font-normal text-muted-foreground">{courses.length}</span></h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{summaries.map((s) => <CourseCard key={s.course.id} s={s} />)}</div>
          </div>
        </div>
      )}
    </>
  );
}
