import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/states";
import { CoursesGrid } from "@/components/courses/courses-grid";
import { CoursesToolbar } from "@/components/courses/courses-toolbar";
import { listAssignments, listCategories, listCourses, listGrades } from "@/lib/data/queries";
import { getProfile } from "@/lib/data/session";
import { summarizeCourses } from "@/lib/course-stats";

export const metadata: Metadata = { title: "My Courses" };

export default async function CoursesPage() {
  const [courses, categories, assignments, grades, profile] = await Promise.all([listCourses(), listCategories(), listAssignments(), listGrades(), getProfile()]);
  const summaries = summarizeCourses(courses, categories, assignments, grades, profile?.grade_scale_preset ?? null);
  return (
    <>
      <PageHeader title="My Courses" description={profile?.current_semester ? `${profile.current_semester} · ${courses.length} course${courses.length === 1 ? "" : "s"}` : `${courses.length} course${courses.length === 1 ? "" : "s"}`}
        actions={<CoursesToolbar defaultSemester={profile?.current_semester} />} />
      {courses.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="No courses yet" description="Create a course, or upload a syllabus PDF and let CoursePilot fill in the details, grading breakdown, and exam dates for you." />
      ) : (
        <CoursesGrid summaries={summaries} />
      )}
    </>
  );
}
