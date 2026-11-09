import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { AssignmentsView } from "@/components/assignments/assignments-view";
import { listAssignments, listCategories, listCourses } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const [assignments, courses, categories] = await Promise.all([listAssignments(), listCourses(), listCategories()]);
  return (
    <>
      <PageHeader title="Assignments" description="Everything you need to do, across all courses." />
      <AssignmentsView assignments={assignments} courses={courses} categories={categories} />
    </>
  );
}
