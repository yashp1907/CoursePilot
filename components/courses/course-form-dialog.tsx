"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { createCourse, deleteCourse, updateCourse } from "@/lib/actions/courses";
import { run } from "@/lib/utils/action";
import { CourseColorPicker } from "./color-picker";
import type { Course } from "@/types/database";

const blank = (c?: Course | null, defaultSemester?: string | null) => ({
  name: c?.name ?? "", code: c?.code ?? "", professor: c?.professor ?? "", professor_email: c?.professor_email ?? "",
  office_hours: c?.office_hours ?? "", classroom: c?.classroom ?? "", semester: c ? c.semester ?? "" : defaultSemester ?? "",
  credits: c?.credits?.toString() ?? "", description: c?.description ?? "", color: c?.color ?? "blue",
});

interface Props { open: boolean; onOpenChange: (o: boolean) => void; course?: Course | null; defaultSemester?: string | null }

export function CourseFormDialog(props: Props) {
  const { open, onOpenChange, course } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={course ? "Edit course" : "New course"} description={course ? undefined : "You can fill in the rest by uploading a syllabus later."}>
        <CourseForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while the dialog is open, so its state is fresh each time.
function CourseForm({ onOpenChange, course, defaultSemester }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => blank(course, defaultSemester));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      if (course) {
        const r = await run(updateCourse(course.id, f), "Course updated");
        if (r.ok) onOpenChange(false); else setErrors(r.fieldErrors ?? {});
      } else {
        const r = await run(createCourse(f), "Course created");
        if (r.ok) { onOpenChange(false); router.push(`/courses/${r.data.id}`); } else setErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Course code" error={errors.code} className="col-span-1"><Input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="IOE 310" /></Field>
        <Field label="Course name" error={errors.name} className="col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Introduction to Optimization" required autoFocus /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Professor" error={errors.professor}><Input value={f.professor} onChange={(e) => set("professor", e.target.value)} /></Field>
        <Field label="Professor email" error={errors.professor_email}><Input type="email" value={f.professor_email} onChange={(e) => set("professor_email", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Semester" error={errors.semester}><Input value={f.semester} onChange={(e) => set("semester", e.target.value)} placeholder="Fall 2026" /></Field>
        <Field label="Credits" error={errors.credits}><Input type="number" step="0.5" min="0" max="30" value={f.credits} onChange={(e) => set("credits", e.target.value)} /></Field>
        <Field label="Classroom" error={errors.classroom}><Input value={f.classroom} onChange={(e) => set("classroom", e.target.value)} /></Field>
      </div>
      <Field label="Office hours" error={errors.office_hours}><Input value={f.office_hours} onChange={(e) => set("office_hours", e.target.value)} placeholder="Tue/Thu 2–3 PM" /></Field>
      <Field label="Description" error={errors.description}><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Color <span className="font-normal text-muted-foreground">shown on cards, the calendar, and lists</span></p>
        <CourseColorPicker value={f.color} onChange={(v) => set("color", v)} />
      </div>
      <div className="flex items-center justify-between pt-1">
        {course ? (
          <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => {
            if (!confirm(`Delete ${course.code ?? course.name}? This permanently removes its assignments, grades, and syllabus.`)) return;
            start(async () => { const r = await run(deleteCourse(course.id), "Course deleted"); if (r.ok) { onOpenChange(false); router.push("/courses"); } });
          }}><Trash2 /> Delete course</Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={pending}>{course ? "Save changes" : "Create course"}</Button>
        </div>
      </div>
    </form>
  );
}
