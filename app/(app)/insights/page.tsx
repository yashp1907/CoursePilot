import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseDot } from "@/components/ui/course-dot";
import { CompletionChart, PerformanceChart, TrendChart, WorkloadChart } from "@/components/insights/charts";
import { listAssignments, listCategories, listCourses, listGrades } from "@/lib/data/queries";
import { getProfile } from "@/lib/data/session";
import { courseGrade } from "@/lib/grades/adapt";
import { courseRisks, gradeTrend } from "@/lib/insights";
import { estimateMinutes } from "@/lib/planner/priority";
import { weeklyWorkload } from "@/lib/planner/workload";
import { displayStatus } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage() {
  const [courses, categories, assignments, grades, profile] = await Promise.all([listCourses(), listCategories(), listAssignments(), listGrades(), getProfile()]);
  if (courses.length === 0) {
    return (<><PageHeader title="Insights" /><EmptyState icon={<BarChart3 />} title="Nothing to analyze yet" description="Insights are built from your real courses, assignments and grades. Add a course and some grades, and trends will appear here." /></>);
  }
  const now = new Date();
  const preset = profile?.grade_scale_preset ?? null;
  const label = (c: (typeof courses)[number]) => c.code ?? c.name;

  const trends = courses.map((c) => ({ courseId: c.id, label: label(c), color: c.color, points: gradeTrend(c, categories.filter((k) => k.course_id === c.id), assignments, grades, preset) }));
  const trendCourses = trends.filter((t) => t.points.length >= 2);
  const perf = courses.map((c) => { const g = courseGrade(c, categories.filter((k) => k.course_id === c.id), assignments.filter((a) => a.course_id === c.id), grades, preset); return { label: label(c), percent: g.percent, letter: g.letter, color: c.color }; });
  const completion = courses.map((c) => {
    const mine = assignments.filter((a) => a.course_id === c.id && a.type !== "study");
    const st = mine.map((a) => displayStatus(a, now));
    return { label: label(c), completed: st.filter((s) => s === "completed" || s === "submitted").length, open: st.filter((s) => s === "not_started" || s === "in_progress").length, overdue: st.filter((s) => s === "overdue").length };
  }).filter((r) => r.completed + r.open + r.overdue > 0);
  const weeks = weeklyWorkload(assignments, now, 8, "UTC").map((w) => ({ label: w.label, hours: Math.round((w.minutes / 60) * 10) / 10, exams: w.exams, items: w.total, busy: w.busy }));
  const risks = courseRisks(courses, categories, assignments, grades, preset, now);
  const hasDefaults = assignments.some((a) => a.status !== "completed" && a.status !== "submitted" && !a.estimated_minutes);
  void estimateMinutes;

  return (
    <>
      <PageHeader title="Insights" description="Every chart and flag here comes from your stored data and says how it was computed." />
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>Academic risk indicators</CardTitle><CardDescription>Plain-language flags with the data behind them. These aren&apos;t predictions, and a missing flag doesn&apos;t guarantee anything.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            {risks.map(({ course, flags }) => (
              <div key={course.id} className="flex gap-3 rounded-md border p-3">
                {flags.length ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
                <div className="min-w-0 flex-1">
                  <Link href={`/courses/${course.id}`} className="flex items-center gap-2 text-sm font-medium hover:text-primary"><CourseDot color={course.color} />{label(course)}</Link>
                  {flags.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{flags.map((f) => <li key={f.code + f.text}>{f.text}</li>)}</ul> : <p className="mt-0.5 text-sm text-muted-foreground">Nothing flagged from the data we have.</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Current grade by course</CardTitle><CardDescription>Based on graded work only.</CardDescription></div></CardHeader>
            <CardContent>
              {perf.some((p) => p.percent !== null) ? <PerformanceChart rows={perf} /> : <p className="text-sm text-muted-foreground">Enter some grades to compare courses.</p>}
              <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">View as table</summary>
                <table className="mt-2 w-full"><tbody className="divide-y">{perf.map((p) => <tr key={p.label}><td className="py-1">{p.label}</td><td className="py-1 text-right tabular-nums">{p.percent === null ? "No grades yet" : `${p.percent.toFixed(1)}% ${p.letter ?? ""}`}</td></tr>)}</tbody></table></details>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Assignment completion</CardTitle><CardDescription>Done, still to do, and overdue.</CardDescription></div></CardHeader>
            <CardContent>
              {completion.length ? <CompletionChart rows={completion} /> : <p className="text-sm text-muted-foreground">No assignments yet.</p>}
              <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">View as table</summary>
                <table className="mt-2 w-full"><thead><tr className="text-left text-muted-foreground"><th className="font-medium">Course</th><th className="text-right font-medium">Done</th><th className="text-right font-medium">To do</th><th className="text-right font-medium">Overdue</th></tr></thead>
                  <tbody className="divide-y">{completion.map((r) => <tr key={r.label}><td className="py-1">{r.label}</td><td className="text-right tabular-nums">{r.completed}</td><td className="text-right tabular-nums">{r.open}</td><td className="text-right tabular-nums">{r.overdue}</td></tr>)}</tbody></table></details>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><div><CardTitle>Grade trends</CardTitle><CardDescription>Your course grade after each graded item, in the order grades were recorded. Needs at least two graded items per course.</CardDescription></div></CardHeader>
          <CardContent>
            {trendCourses.length === 0 ? <p className="text-sm text-muted-foreground">Once you have two or more grades in a course, its trend shows up here.</p> : (
              <div className="grid gap-5 md:grid-cols-2">
                {trendCourses.map((t) => (
                  <div key={t.courseId}><p className="mb-1 flex items-center gap-2 text-sm font-medium"><CourseDot color={t.color} />{t.label}</p><TrendChart s={t} />
                    <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">View as table</summary><ol className="mt-1 space-y-0.5">{t.points.map((p, i) => <li key={i} className="flex justify-between"><span>{p.label}</span><span className="tabular-nums">{p.percent}%</span></li>)}</ol></details></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Workload by week</CardTitle><CardDescription>Estimated hours of open work by due week{hasDefaults ? ". Items without your own estimate use defaults by type" : ""}.</CardDescription></div></CardHeader>
          <CardContent>
            <WorkloadChart rows={weeks} />
            <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">View as table</summary>
              <table className="mt-2 w-full"><thead><tr className="text-left text-muted-foreground"><th className="font-medium">Week</th><th className="text-right font-medium">Due</th><th className="text-right font-medium">Exams</th><th className="text-right font-medium">Hours</th></tr></thead>
                <tbody className="divide-y">{weeks.map((w) => <tr key={w.label}><td className="py-1">{w.label}{w.busy ? " (busy)" : ""}</td><td className="text-right tabular-nums">{w.items}</td><td className="text-right tabular-nums">{w.exams}</td><td className="text-right tabular-nums">{w.hours}</td></tr>)}</tbody></table></details>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
