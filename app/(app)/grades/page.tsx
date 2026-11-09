import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CourseChip } from "@/components/ui/course-chip";
import { GradeCalculator } from "@/components/grades/grade-calculator";
import { KindBadge, fmtPct } from "@/components/grades/grade-badge";
import { GpaSimulator } from "@/components/grades/gpa-simulator";
import { GradeCourseSwitcher } from "@/components/grades/course-switcher";
import { listAssignments, listCategories, listCourses, listGrades } from "@/lib/data/queries";
import { getProfile } from "@/lib/data/session";
import { summarizeCourses } from "@/lib/course-stats";
import { computeGpa } from "@/lib/grades/gpa";
import { gradeRange } from "@/lib/grades/calculations";
import { buildItems, buildScheme } from "@/lib/grades/adapt";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ course?: string; view?: string }> }) {
  const { course: selectedId, view } = await searchParams;
  const [courses, categories, assignments, grades, profile] = await Promise.all([listCourses(), listCategories(), listAssignments(), listGrades(), getProfile()]);
  if (courses.length === 0) {
    return (<><PageHeader title="Grades" /><EmptyState icon={<GraduationCap />} title="No courses yet" description="Create a course first, then enter grades and try what-if scenarios." action={<Link href="/courses" className="text-sm font-medium text-primary hover:underline">Go to My Courses</Link>} /></>);
  }
  const preset = profile?.grade_scale_preset ?? "standard";
  const summaries = summarizeCourses(courses, categories, assignments, grades, preset);
  const gpa = computeGpa(summaries.map((s) => ({ credits: s.course.credits, letter: s.grade.letter })));
  const tabs = (
    <div className="mb-5 inline-flex rounded-md border bg-card p-0.5" role="tablist" aria-label="Grades view">
      {[["", "My grades"], ["gpa", "GPA simulator"]].map(([v, label]) => (
        <Link key={v} role="tab" aria-selected={(view ?? "") === v} href={v ? `/grades?view=${v}` : "/grades"} className={`rounded px-3 py-1 text-sm font-medium ${(view ?? "") === v ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>
      ))}
    </div>
  );
  if (view === "gpa") {
    return (
      <>
        <PageHeader title="Grades" description="Explore hypothetical semester outcomes." />
        {tabs}
        <GpaSimulator initialRows={summaries.map((s) => ({ name: s.course.code ?? s.course.name, credits: s.course.credits, letter: s.grade.letter }))} defaultUniversity={profile?.university ?? null} />
      </>
    );
  }
  const selected = courses.find((c) => c.id === selectedId) ?? courses[0];
  const myAssignments = assignments.filter((a) => a.course_id === selected.id);

  return (
    <>
      <PageHeader title="Grades" description="Current grades come only from graded work. Use the calculator to explore what-ifs and targets."
        actions={gpa ? <div className="text-right"><p className="text-xs text-muted-foreground">Current GPA <span title="Credit-weighted from current letter grades on a 4.0 +/- scale">(estimated)</span></p><p className="text-lg font-semibold leading-tight">{gpa.gpa.toFixed(2)}</p></div> : undefined} />
      {tabs}
      <Card className="mb-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Course</th><th className="px-4 py-2 text-right font-medium">Current</th><th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Possible range</th><th className="hidden px-4 py-2 text-right font-medium md:table-cell">Credits</th></tr></thead>
          <tbody className="divide-y">
            {summaries.map(({ course: c, grade }) => {
              const r = gradeRange(buildScheme(c, categories.filter((k) => k.course_id === c.id), preset), buildItems(assignments.filter((a) => a.course_id === c.id), grades));
              return (
                <tr key={c.id} className={c.id === selected.id ? "bg-primary-soft/40" : ""}>
                  <td className="px-4 py-2.5"><Link href={`/grades?course=${c.id}`} className="flex items-center gap-2 font-medium hover:text-primary"><CourseChip color={c.color} label={c.code ?? c.name} />{c.is_demo && <Badge variant="warning">Demo</Badge>}</Link></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{grade.percent === null ? <span className="text-muted-foreground">No grades yet</span> : <>{fmtPct(grade.percent, 1)} <span className="ml-1 font-medium text-primary">{grade.letter}</span></>}</td>
                  <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{grade.percent === null ? "–" : `${fmtPct(r.min.percent, 0)} – ${fmtPct(r.max.percent, 0)}`}</td>
                  <td className="hidden px-4 py-2.5 text-right text-muted-foreground md:table-cell">{c.credits ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground"><KindBadge kind="current" /> Ungraded work is never counted as zero.</div>
      </Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Calculator</h2>
        <GradeCourseSwitcher courses={courses.map((c) => ({ id: c.id, label: c.code ?? c.name }))} selected={selected.id} />
      </div>
      <GradeCalculator key={selected.id} course={selected} categories={categories.filter((c) => c.course_id === selected.id)} assignments={myAssignments} grades={grades.filter((g) => myAssignments.some((a) => a.id === g.assignment_id))} presetKey={preset} />
    </>
  );
}
