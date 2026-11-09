"use client";
import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { createAssignment, deleteAssignment, updateAssignment } from "@/lib/actions/assignments";
import { run } from "@/lib/utils/action";
import { isoToLocalInput, localInputToIso, TYPE_LABEL } from "@/lib/utils/dates";
import type { Assignment, Course, GradingCategoryRow } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  courses: Course[];
  categories: GradingCategoryRow[];
  assignment?: Assignment | null;
  defaultCourseId?: string;
  defaultDue?: string; // datetime-local
}

export function AssignmentDialog(props: Props) {
  const { open, onOpenChange, courses, assignment } = props;
  const fromSync = assignment && assignment.source !== "manual";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={assignment ? "Edit assignment" : "New assignment"}
        description={fromSync ? `Imported from ${assignment!.source}. Your edits are kept.` : "Add coursework or a personal study task."}
      >
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a course first, then you can add assignments to it.</p>
        ) : (
          <AssignmentForm {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while the dialog is open, so its state is fresh each time.
function AssignmentForm({ onOpenChange, courses, categories, assignment, defaultCourseId, defaultDue }: Props) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState(() => initial(assignment, defaultCourseId ?? courses[0]?.id ?? "", defaultDue));
  const cats = useMemo(() => categories.filter((c) => c.course_id === f.course_id), [categories, f.course_id]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const edited = !!assignment;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = {
        course_id: f.course_id, category_id: f.category_id || null, title: f.title, description: f.description, type: f.type as never,
        due_at: localInputToIso(f.due), estimated_minutes: f.estimated_minutes, priority: f.priority as never, status: f.status as never,
        points_possible: f.points_possible, is_extra_credit: f.is_extra_credit,
      };
      const r = await run(edited ? updateAssignment(assignment!.id, payload) : createAssignment(payload), edited ? "Assignment updated" : "Assignment added");
      if (r.ok) onOpenChange(false); else setErrors(r.fieldErrors ?? {});
    });
  }

  function remove() {
    if (!assignment || !confirm(`Delete "${assignment.title}"? This also removes its grade.`)) return;
    start(async () => {
      const r = await run(deleteAssignment(assignment.id), "Assignment deleted");
      if (r.ok) onOpenChange(false);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {assignment?.external_url && <a href={assignment.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ExternalLink className="size-3.5" /> Open assignment page</a>}
      <Field label="Title" error={errors.title}><Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus placeholder="Problem Set 4" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course" error={errors.course_id}>
          <NativeSelect value={f.course_id} onChange={(e) => setF((p) => ({ ...p, course_id: e.target.value, category_id: "" }))}>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Type">
          <NativeSelect value={f.type} onChange={(e) => set("type", e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due" error={errors.due_at}><Input type="datetime-local" value={f.due} onChange={(e) => set("due", e.target.value)} /></Field>
        <Field label="Grading category" hint={cats.length ? undefined : "Add categories in the course's Grades tab."}>
          <NativeSelect value={f.category_id} onChange={(e) => set("category_id", e.target.value)} disabled={!cats.length}>
            <option value="">None</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Points" error={errors.points_possible}><Input type="number" min="0" step="any" value={f.points_possible} onChange={(e) => set("points_possible", e.target.value)} placeholder="100" /></Field>
        <Field label="Est. minutes" error={errors.estimated_minutes}><Input type="number" min="0" step="1" value={f.estimated_minutes} onChange={(e) => set("estimated_minutes", e.target.value)} placeholder="90" /></Field>
        <Field label="Priority">
          <NativeSelect value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <NativeSelect value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="not_started">Not started</option><option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option><option value="completed">Completed</option>
          </NativeSelect>
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_extra_credit} onChange={(e) => set("is_extra_credit", e.target.checked)} className="size-4 accent-[var(--primary)]" /> Extra credit
        </label>
      </div>
      <Field label="Notes"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
      <div className="flex items-center justify-between pt-1">
        {edited ? <Button type="button" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}><Trash2 /> Delete</Button> : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={pending}>{edited ? "Save changes" : "Add assignment"}</Button>
        </div>
      </div>
    </form>
  );
}

function initial(a: Assignment | null | undefined, courseId: string, defaultDue?: string) {
  return {
    title: a?.title ?? "", course_id: a?.course_id ?? courseId, category_id: a?.category_id ?? "", type: (a?.type ?? "homework") as string,
    due: a ? isoToLocalInput(a.due_at) : defaultDue ?? "", points_possible: a?.points_possible?.toString() ?? "",
    estimated_minutes: a?.estimated_minutes?.toString() ?? "", priority: (a?.priority ?? "medium") as string, status: (a?.status ?? "not_started") as string,
    is_extra_credit: a?.is_extra_credit ?? false, description: a?.description ?? "",
  };
}
