import Link from "next/link";
import { Clock, Mail, MapPin, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignmentsView } from "@/components/assignments/assignments-view";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { CourseInfoPanel } from "@/components/courses/course-info-panel";
import { SyllabusReview } from "@/components/courses/syllabus-review";
import { WebsitePanel } from "@/components/courses/website-panel";
import { GradeCalculator } from "@/components/grades/grade-calculator";
import { GradeFigure } from "@/components/grades/grade-badge";
import { courseInfoSchema } from "@/lib/course-info/schemas";
import { describeMeeting } from "@/lib/course-info/view";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";
import { getCanvasMethod, getCourseAnnouncements, getCourseChat, getCourseInfoRow, getCourseWebsite } from "@/lib/data/course-queries";
import { getSyllabus, listActivity, listAssignmentsWithGrades, listCategories } from "@/lib/data/queries";
import { getProfile } from "@/lib/data/session";
import { courseGrade } from "@/lib/grades/adapt";
import { displayStatus, formatDue } from "@/lib/utils/dates";
import type { Course } from "@/types/database";

/**
 * One server component per tab. Only the ACTIVE tab runs, and each starts all of its queries together, so a tab costs
 * one parallel round trip (~300 ms) instead of rendering all seven tabs' data on every click.
 */

export async function OverviewTab({ course }: { course: Course }) {
  const id = course.id;
  const [{ assignments, grades }, categories, profile, activity, announcements, infoRow] = await Promise.all([
    listAssignmentsWithGrades(id), listCategories(id), getProfile(), listActivity(6, id), getCourseAnnouncements(id), getCourseInfoRow(id),
  ]);
  const parsedInfo = infoRow?.info ? courseInfoSchema.safeParse(infoRow.info) : null;
  const courseInfo = parsedInfo?.success ? parsedInfo.data : null;
  const grade = courseGrade(course, categories, assignments, grades, profile?.grade_scale_preset);
  const now = new Date();
  const upcoming = assignments.filter((a) => a.due_at && new Date(a.due_at) >= now && a.status !== "completed" && a.status !== "submitted").slice(0, 5);
  const overdue = assignments.filter((a) => displayStatus(a, now) === "overdue");
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Upcoming deadlines</CardTitle></CardHeader>
          <CardContent>
            {overdue.length > 0 && <p className="mb-2 text-sm font-medium text-destructive">{overdue.length} overdue assignment{overdue.length === 1 ? "" : "s"}</p>}
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Nothing upcoming. Add assignments or upload a syllabus.</p> : (
              <ul className="divide-y">{upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate">{a.title}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDue(a.due_at)}</span></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Grading breakdown</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? <p className="text-sm text-muted-foreground">No grading categories yet. Upload a syllabus or set them up in the Grades tab.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Category</th><th className="pb-2 text-right font-medium">Weight</th><th className="pb-2 text-right font-medium">Your average</th></tr></thead>
                <tbody className="divide-y">{grade.categories.map((c) => (
                  <tr key={c.id}><td className="py-2">{c.name}{c.droppedIds.length > 0 && <Badge variant="warning" className="ml-2">dropped {c.droppedIds.length}</Badge>}</td>
                    <td className="py-2 text-right">{course.grading_mode === "weighted" ? `${c.weight}%` : "–"}</td>
                    <td className="py-2 text-right tabular-nums">{c.percent === null ? "–" : `${c.percent.toFixed(1)}%`}</td></tr>
                ))}</tbody></table>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-5">
        <Card><CardContent className="pt-5"><GradeFigure result={grade} />{grade.percent === null && <p className="mt-1 text-xs text-muted-foreground">No grades entered yet.</p>}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Course info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {course.professor && <p className="flex items-center gap-2"><User className="size-4 text-muted-foreground" />{course.professor}</p>}
            {course.professor_email && <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /><a className="text-primary hover:underline" href={`mailto:${course.professor_email}`}>{course.professor_email}</a></p>}
            {course.office_hours && <p className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" />{course.office_hours}</p>}
            {course.classroom && <p className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{course.classroom}</p>}
            {courseInfo && courseInfo.meetings.filter((m) => ["lecture", "lab", "discussion", "recitation"].includes(m.kind)).slice(0, 3).map((m, i) => <p key={i} className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" /><span><span className="font-medium capitalize">{m.kind}</span> <span className="text-muted-foreground">{describeMeeting({ ...m, location: null })}</span></span></p>)}
            {courseInfo && courseInfo.people.length > 0 && <p className="border-t pt-2 text-[13px] text-muted-foreground">{courseInfo.people.length} on the teaching team · <Link href={`/courses/${course.id}?tab=info`} className="font-medium text-primary hover:underline">See staff, office hours &amp; links →</Link></p>}
            {!course.professor && !course.professor_email && !course.office_hours && !course.classroom && !courseInfo && <p className="text-muted-foreground">No details yet. Sync Canvas, upload a syllabus, or edit the course.</p>}
            {course.description && <p className="border-t pt-2 text-muted-foreground">{course.description}</p>}
          </CardContent>
        </Card>
        {announcements.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Canvas announcements</CardTitle></CardHeader>
            <CardContent><ul className="space-y-2 text-sm">{announcements.map((a) => <li key={a.id}>{a.url ? <a className="font-medium text-primary hover:underline" href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a> : <p className="font-medium">{a.title}</p>}{a.posted_at && <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.posted_at), { addSuffix: true })}</p>}</li>)}</ul></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>{activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
            <ul className="space-y-2 text-sm">{activity.map((a) => <li key={a.id}><p>{a.message}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p></li>)}</ul>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export async function AssignmentsTab({ course }: { course: Course }) {
  const [{ assignments }, categories] = await Promise.all([listAssignmentsWithGrades(course.id), listCategories(course.id)]);
  return <AssignmentsView assignments={assignments} courses={[course]} categories={categories} lockedCourseId={course.id} />;
}

export async function GradesTab({ course }: { course: Course }) {
  const [{ assignments, grades }, categories, profile] = await Promise.all([listAssignmentsWithGrades(course.id), listCategories(course.id), getProfile()]);
  return <GradeCalculator course={course} categories={categories} assignments={assignments} grades={grades} presetKey={profile?.grade_scale_preset ?? "standard"} />;
}

export async function InfoTab({ course }: { course: Course }) {
  const [row, method, syllabus] = await Promise.all([getCourseInfoRow(course.id), getCanvasMethod(), getSyllabus(course.id)]);
  const synPol = syllabus?.extracted ? syllabusExtractionSchema.safeParse(syllabus.extracted) : null;
  const fallbackPolicies = synPol?.success
    ? ([["Late work", synPol.data.policies.late_submission], ["Attendance", synPol.data.policies.attendance], ["Extra credit", synPol.data.policies.extra_credit], ["Exams", synPol.data.policies.exam_policy]] as [string, string | null][]).filter(([, t]) => t).map(([label, text]) => ({ label, text: text! }))
    : [];
  return <CourseInfoPanel course={course} row={row} fallbackPolicies={fallbackPolicies} canvasMethod={method} canvasConnected={!!method} />;
}

export async function SyllabusTab({ course }: { course: Course }) {
  const [syllabus, { assignments }] = await Promise.all([getSyllabus(course.id), listAssignmentsWithGrades(course.id)]);
  return <SyllabusReview courseId={course.id} syllabus={syllabus} existing={assignments} />;
}

export async function WebsiteTab({ course }: { course: Course }) {
  const [site, { assignments }] = await Promise.all([getCourseWebsite(course.id), listAssignmentsWithGrades(course.id)]);
  return <WebsitePanel courseId={course.id} courseLabel={course.code ?? course.name} site={site} existing={assignments} />;
}

export async function AssistantTab({ course }: { course: Course }) {
  const chat = await getCourseChat(course.id);
  return <AssistantChat activeId={chat.id} initialMessages={chat.messages} courses={[]} lockedCourseId={course.id} basePath={`/courses/${course.id}?tab=assistant`} />;
}
