import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { CalendarView } from "@/components/calendar/calendar-view";
import { listAssignments, listCategories, listCourses, listEvents } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [assignments, events, courses, categories] = await Promise.all([listAssignments(), listEvents(), listCourses(), listCategories()]);
  return (
    <>
      <PageHeader title="Calendar" description="Assignments, exams, and your own events in one place." />
      <CalendarView assignments={assignments} events={events} courses={courses} categories={categories} />
    </>
  );
}
