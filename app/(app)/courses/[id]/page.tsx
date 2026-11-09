import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CourseChip } from "@/components/ui/course-chip";
import { courseHex, tint } from "@/lib/utils/colors";
import { CourseTabs, TabSkeleton, type TabKey } from "@/components/courses/course-tabs";
import { EditCourseButton } from "@/components/courses/course-header-actions";
import { getCourse } from "@/lib/data/queries";
import { AssignmentsTab, AssistantTab, GradesTab, InfoTab, OverviewTab, SyllabusTab, WebsiteTab } from "./tab-panels";

const TABS: TabKey[] = ["overview", "assignments", "grades", "info", "syllabus", "website", "assistant"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Course" };
  const c = await getCourse(id);
  return { title: c ? (c.code ?? c.name) : "Course" };
}

export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const course = await getCourse(id);
  if (!course) notFound();
  const active: TabKey = TABS.includes(tab as TabKey) ? (tab as TabKey) : "overview";

  return (
    <>
      <Link href="/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> My Courses</Link>
      <div className="relative mb-6 overflow-hidden rounded-xl border bg-card">
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${courseHex(course.color)}, color-mix(in srgb, ${courseHex(course.color)} 45%, transparent))` }} />
        <div className="flex flex-wrap items-start justify-between gap-3 p-5" style={{ backgroundImage: `linear-gradient(135deg, ${tint(course.color, 7)}, transparent 55%)` }}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CourseChip color={course.color} label={course.code ?? "Course"} />
              {course.semester && <span>{course.semester}</span>}{course.credits !== null && <span>· {course.credits} credits</span>}{course.is_demo && <Badge variant="warning">Demo data</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{course.name}</h1>
            {course.professor && <p className="mt-1 text-sm text-muted-foreground">{course.professor}</p>}
          </div>
          <EditCourseButton course={course} />
        </div>
      </div>
      <CourseTabs active={active}>
        <Suspense key={active} fallback={<TabSkeleton />}>
          {active === "overview" && <OverviewTab course={course} />}
          {active === "assignments" && <AssignmentsTab course={course} />}
          {active === "grades" && <GradesTab course={course} />}
          {active === "info" && <InfoTab course={course} />}
          {active === "syllabus" && <SyllabusTab course={course} />}
          {active === "website" && <WebsiteTab course={course} />}
          {active === "assistant" && <AssistantTab course={course} />}
        </Suspense>
      </CourseTabs>
    </>
  );
}
