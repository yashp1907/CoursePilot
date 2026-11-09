import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { PlannerView } from "@/components/planner/planner-view";
import { createClient } from "@/lib/supabase/server";
import { listAssignments, listCategories, listCourses } from "@/lib/data/queries";
import type { StudyTask } from "@/types/database";

export const metadata: Metadata = { title: "Study Planner" };

export default async function PlannerPage() {
  const supabase = await createClient();
  const [assignments, courses, categories, tasks, settings] = await Promise.all([
    listAssignments(), listCourses(), listCategories(),
    supabase.from("study_tasks").select("id, assignment_id, course_id, title, estimated_minutes, scheduled_for, done, sort_order").order("sort_order"),
    // `availability` arrives with migration 2; fall back gracefully before it is applied.
    supabase.from("user_settings").select("weekly_study_hours, availability").maybeSingle(),
  ]);
  const fallback = settings.error ? await supabase.from("user_settings").select("weekly_study_hours").maybeSingle() : null;
  const s = (settings.error ? fallback?.data : settings.data) as { weekly_study_hours?: number; availability?: number[] | null } | null;
  return (
    <>
      <PageHeader title="Study Planner" description="Turn your real deadlines into a realistic week." />
      <PlannerView assignments={assignments} courses={courses} categories={categories} studyTasks={(tasks.data ?? []) as StudyTask[]} weeklyHours={Number(s?.weekly_study_hours ?? 15)} availability={s?.availability ?? null} />
    </>
  );
}
