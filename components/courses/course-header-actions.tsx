"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseFormDialog } from "./course-form-dialog";
import type { Course } from "@/types/database";

export function EditCourseButton({ course }: { course: Course }) {
  const [open, setOpen] = useState(false);
  return (<><Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit course</Button><CourseFormDialog open={open} onOpenChange={setOpen} course={course} /></>);
}
