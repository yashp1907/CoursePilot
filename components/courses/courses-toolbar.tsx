"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseFormDialog } from "./course-form-dialog";
import { NewCourseFromSyllabus } from "./new-course-from-syllabus";

export function CoursesToolbar({ defaultSemester }: { defaultSemester?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NewCourseFromSyllabus defaultSemester={defaultSemester} />
      <Button onClick={() => setOpen(true)}><Plus /> New course</Button>
      <CourseFormDialog open={open} onOpenChange={setOpen} defaultSemester={defaultSemester} />
    </>
  );
}
