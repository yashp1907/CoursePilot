import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, Clock, Info, MapPin, MessageSquare, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { InfoActions } from "./course-info-actions";
import { cleanStored } from "@/lib/utils/errors";
import { canvasHostsFrom, cleanLinkLabel, curateLinks, formatDays, formatTimeRange, isGenericTitle } from "@/lib/course-info/view";
import { cn } from "@/lib/utils";
import { LinkChips, TeamList, TodayBadge, type Chip } from "./course-info-bits";
import { courseInfoSchema, rawCourseInfoSchema, type CourseInfo } from "@/lib/course-info/schemas";
import { readable, tint } from "@/lib/utils/colors";
import type { Course } from "@/types/database";

export interface InfoRow { status: string; error: string | null; info: unknown; raw: unknown; extracted_at: string | null; fetched_at: string }

const MEETING_LABEL: Record<string, string> = { lecture: "Lecture", lab: "Lab", discussion: "Discussion", recitation: "Recitation", office_hours: "Office hours", exam: "Exam", other: "Meeting" };

export function CourseInfoPanel({ course, row, fallbackPolicies, canvasMethod, canvasConnected }: {
  course: Course; row: InfoRow | null; fallbackPolicies: { label: string; text: string }[]; canvasMethod: "api" | "extension" | null; canvasConnected: boolean;
}) {
  const parsed = row?.info ? courseInfoSchema.safeParse(row.info) : null;
  const info: CourseInfo | null = parsed?.success ? parsed.data : null;
  const raw = row?.raw ? rawCourseInfoSchema.safeParse(row.raw) : null;
  const modules = raw?.success ? raw.data.modules : [];
  const sections = raw?.success ? raw.data.sections : [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3.5 py-2">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><Info className="size-4" /></div>
        <div>
          <p className="text-sm font-medium">Course info</p>
          <p className="text-xs text-muted-foreground">
            {row ? `From Canvas · read ${formatDistanceToNow(new Date(row.extracted_at ?? row.fetched_at), { addSuffix: true })}${row.status === "pending" ? " · still reading pages…" : ""}` : "Not read from Canvas yet"}
          </p>
        </div>
      </div>
      <InfoActions courseId={course.id} canvasMethod={canvasMethod} pending={row?.status === "pending"} failed={row?.status === "failed"} connected={canvasConnected} />
    </div>
  );

  if (!info && !row) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={<Users />} title="No course info yet" description={canvasConnected ? "Sync Canvas and CoursePilot will read this course's syllabus tab, home page, staff list, calendar and links, then show class times, your teaching team, office hours and contacts here." : "Connect Canvas (Integrations) and CoursePilot will read this course's syllabus tab, home page, staff list and links, then show class times, your teaching team, office hours and contacts here."} />
        {(course.professor || course.office_hours || course.classroom || fallbackPolicies.length > 0) && <FallbackBlock course={course} policies={fallbackPolicies} />}
      </div>
    );
  }

  const failed = row?.status === "failed";
  const people = info?.people ?? [];
  const meetings = info?.meetings ?? [];
  const classMeetings = meetings.filter((m) => m.kind !== "office_hours");
  // Office-hours blocks already shown on a person's row would be duplicated here, so only unattributed ones stay.
  const attributed = new Set(people.filter((p) => p.office_hours).map((p) => p.name.toLowerCase()));
  const looseOH = meetings.filter((m) => m.kind === "office_hours" && !(m.person && [...attributed].some((n) => n.includes(m.person!.toLowerCase().split(" ")[0]) || m.person!.toLowerCase().includes(n.split(" ")[0]))));
  const sched = [...classMeetings, ...looseOH];
  const canvasHosts = canvasHostsFrom(raw?.success ? raw.data.tabs : []);
  const curated = curateLinks(info?.links ?? [], 7, canvasHosts);
  const contactChips: Chip[] = (info?.contacts ?? []).map((c) => ({ label: cleanLinkLabel(c.label), url: c.type === "email" ? `mailto:${c.value}` : c.type === "phone" ? null : c.value, kind: c.type === "forum" ? "forum" : "other", mail: c.type === "email" }));
  const primaryChips: Chip[] = [...contactChips, ...curated.primary].slice(0, 9);
  const moreChips: Chip[] = [...contactChips, ...curated.primary].slice(9).concat(curated.more);
  const hasChips = primaryChips.length > 0;
  const facts = info?.key_info ?? [];
  const policies = info ? [["Late work", info.policies.late], ["Attendance", info.policies.attendance], ["Exams", info.policies.exams], ["Collaboration & AI", info.policies.collaboration], ...info.policies.other.map((o) => [o.title, o.text])].filter(([, t]) => t) as [string, string][] : [];
  const empty = !info || (!info.summary && !sched.length && !people.length && !hasChips && !facts.length && !policies.length);
  const hasMore = policies.length > 0 || facts.length > 4 || (info?.textbooks.length ?? 0) > 0 || !!info?.grading_summary || modules.length > 0 || sections.length > 0;

  return (
    <div className="space-y-4">
      {header}
      {failed && <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-warning" role="status"><Info className="mt-0.5 size-4 shrink-0" /><span>{cleanStored(row?.error, "We couldn't finish reading this course's pages.")}{people.length > 0 ? " The staff list from Canvas is shown below. Use “Try again” to read the rest." : " Use “Try again” to retry."}</span></p>}
      {empty && !failed && <EmptyState icon={<Info />} title="Canvas didn't have much for this course" description="This course's syllabus tab, home page and staff list were empty or hidden. You can still upload the syllabus or connect the course website." />}

      {(info?.summary || facts.length > 0) && (
        <div className="rounded-xl border bg-card px-4 py-3">
          {info?.summary && <p className="line-clamp-2 text-sm leading-relaxed" title={info.summary}>{info.summary}</p>}
          {facts.length > 0 && <div className={cn("flex flex-wrap gap-1.5", info?.summary && "mt-2")}>{facts.slice(0, 4).map((k, i) => <span key={i} className="rounded-md bg-muted px-2 py-1 text-xs"><span className="font-medium text-muted-foreground">{k.label}: </span>{k.value}</span>)}</div>}
          {info && info.warnings.length > 0 && <p className="mt-2 text-xs text-warning">Worth verifying: {info.warnings.join(" · ")}</p>}
        </div>
      )}

      {(sched.length > 0 || hasChips) && (
        <div className={cn("grid items-start gap-4", sched.length > 0 && hasChips ? "lg:grid-cols-[3fr_2fr]" : "")}>
          {sched.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Clock className="size-4" /> Schedule</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {sched.map((m, i) => {
                    const time = formatTimeRange(m.start_time, m.end_time);
                    const when = [formatDays(m.days), time].filter(Boolean).join(" · ");
                    return (
                      <li key={i} className="flex flex-col items-start gap-1 py-2 text-sm first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
                        <span className="mt-px min-w-[5.75rem] shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-center text-xs font-semibold" style={{ backgroundColor: tint(course.color, 14), color: readable(course.color) }}>{MEETING_LABEL[m.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-medium">{when || m.title || "Time not listed"}</span>
                            <TodayBadge days={m.days} />
                            {!isGenericTitle(m.title) && when && <span className="text-muted-foreground">{m.title}</span>}
                            {m.section && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Sec {m.section}</span>}
                            {m.person && <span className="text-muted-foreground">{m.person}</span>}
                          </span>
                          {m.notes && <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" title={m.notes}>{m.notes}</span>}
                        </span>
                        {m.location && <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground"><MapPin className="size-3.5" />{m.location}</span>}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
          {hasChips && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" /> Quick links</CardTitle></CardHeader>
              <CardContent><LinkChips primary={primaryChips} more={moreChips} /></CardContent>
            </Card>
          )}
        </div>
      )}

      {people.length > 0 && (
        <Card>
          <CardHeader className="pb-1"><div><CardTitle className="flex items-center gap-2"><Users className="size-4" /> Teaching team <span className="text-xs font-normal text-muted-foreground">{people.length}</span></CardTitle></div></CardHeader>
          <CardContent><TeamList people={people} color={course.color} /></CardContent>
        </Card>
      )}

      {hasMore && (
        <Card>
          <CardHeader className="pb-1"><CardTitle>More details</CardTitle></CardHeader>
          <CardContent className="space-y-0 divide-y">
            {policies.length > 0 && <More title="Policies" count={policies.length}><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{policies.map(([t, text], i) => <div key={i} className="text-sm"><dt className="font-medium">{t}</dt><dd className="mt-0.5 text-muted-foreground">{text}</dd></div>)}</dl></More>}
            {(info?.grading_summary || facts.length > 4 || (info?.textbooks.length ?? 0) > 0) && (
              <More title="Grading, facts & textbooks" count={(info?.grading_summary ? 1 : 0) + Math.max(0, facts.length - 4) + (info?.textbooks.length ?? 0)}>
                <div className="space-y-3 text-sm">
                  {info?.grading_summary && <p><span className="font-medium">Grading: </span><span className="text-muted-foreground">{info.grading_summary}</span></p>}
                  {facts.length > 4 && <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{facts.slice(4).map((k, i) => <div key={i}><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</dt><dd>{k.value}</dd></div>)}</dl>}
                  {(info?.textbooks.length ?? 0) > 0 && <ul className="space-y-0.5">{info!.textbooks.map((t, i) => <li key={i}>📖 {t.title}{t.notes ? <span className="text-muted-foreground"> · {t.notes}</span> : null}</li>)}</ul>}
                </div>
              </More>
            )}
            {modules.length > 0 && (
              <More title="Course outline" count={modules.length}>
                <ul className="divide-y rounded-md border">{modules.map((m, i) => <li key={i}><details className="px-3 py-1.5"><summary className="flex cursor-pointer items-center justify-between text-sm"><span>{m.name}</span><span className="text-xs text-muted-foreground">{m.items.length}</span></summary>{m.items.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-muted-foreground">{m.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}</details></li>)}</ul>
              </More>
            )}
            {sections.length > 0 && <More title="Canvas sections" count={sections.length}><p className="text-sm text-muted-foreground">{sections.map((s) => s.name).join(" · ")}</p></More>}
          </CardContent>
        </Card>
      )}
      <p className="text-center text-xs text-muted-foreground">Read from Canvas by CoursePilot. If something looks off, check the <Link href={`/courses/${course.id}?tab=syllabus`} className="text-primary hover:underline">syllabus</Link> or ask your instructor.</p>
    </div>
  );
}

/** One collapsed row in "More details": title + count, expands in place. */
function More({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group py-2.5 first:pt-1">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>{title} <span className="ml-1 text-xs font-normal text-muted-foreground">{count}</span></span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function FallbackBlock({ course, policies }: { course: Course; policies: { label: string; text: string }[] }) {
  return (
    <Card>
      <CardHeader><div><CardTitle>What we have so far</CardTitle><CardDescription>From your syllabus and course details.</CardDescription></div></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {course.professor && <p><span className="font-medium">Instructor: </span>{course.professor}{course.professor_email && <> · <a className="text-primary hover:underline" href={`mailto:${course.professor_email}`}>{course.professor_email}</a></>}</p>}
        {course.office_hours && <p className="flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" />{course.office_hours}</p>}
        {course.classroom && <p className="flex items-center gap-1.5"><MapPin className="size-4 text-muted-foreground" />{course.classroom}</p>}
        {policies.map((p) => <p key={p.label}><span className="font-medium">{p.label}: </span><span className="text-muted-foreground">{p.text}</span></p>)}
      </CardContent>
    </Card>
  );
}
