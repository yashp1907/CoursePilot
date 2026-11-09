"use client";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CourseChip } from "@/components/ui/course-chip";
import { countdown, URGENCY_STYLE } from "@/lib/utils/countdown";
import { cn } from "@/lib/utils";
import { createAssignment, deleteAssignment, setAssignmentStatus, updateAssignment } from "@/lib/actions/assignments";
import { run } from "@/lib/utils/action";
import { displayStatus, formatDue, isoToLocalInput, localInputToIso, STATUS_LABEL, TYPE_LABEL } from "@/lib/utils/dates";
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
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <DialogBody {...props} />}
    </Dialog>
  );
}

// Mounted only while open, so its state is fresh each time. Existing assignments open in a read-only view first.
function DialogBody(props: Props) {
  const { courses, assignment } = props;
  const [editing, setEditing] = useState(!assignment);
  const viewing = !!assignment && !editing;
  const fromSync = assignment && assignment.source !== "manual";
  return (
    <DialogContent
      title={viewing ? "Assignment details" : assignment ? "Edit assignment" : "New assignment"}
      description={viewing ? undefined : fromSync ? `Imported from ${assignment!.source}. Your edits are kept.` : "Add coursework or a personal study task."}
      className={viewing ? "[&>div:first-child]:sr-only" : undefined}
    >
      {courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a course first, then you can add assignments to it.</p>
      ) : viewing ? (
        <AssignmentDetails {...props} assignment={assignment!} onEdit={() => setEditing(true)} />
      ) : (
        <AssignmentForm {...props} onCancel={assignment ? () => setEditing(false) : undefined} />
      )}
    </DialogContent>
  );
}

const STATUS_BADGE = { not_started: "default", in_progress: "primary", completed: "success", submitted: "success", overdue: "danger" } as const;
const PRIORITY_BADGE = { high: "danger", medium: "warning", low: "default" } as const;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm">{children}</dd></div>;
}

function AssignmentDetails({ onOpenChange, courses, categories, assignment: a, onEdit }: Props & { assignment: Assignment; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const course = courses.find((c) => c.id === a.course_id);
  const category = categories.find((c) => c.id === a.category_id);
  const st = displayStatus(a);
  const done = st === "completed" || st === "submitted";
  const cd = a.due_at && !done ? countdown(a.due_at) : null;
  const link = a.external_url && /^https?:\/\//i.test(a.external_url) ? a.external_url : null;
  const where = a.source === "canvas" ? "Open in Canvas" : "Open assignment page";

  const toggle = () => start(async () => {
    const r = await run(setAssignmentStatus(a.id, done ? "not_started" : "completed"), done ? "Marked not done" : "Marked complete");
    if (r.ok) onOpenChange(false);
  });

  return (
    <div className="space-y-5">
      <div className="pr-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CourseChip color={course?.color} label={course?.code ?? course?.name ?? "Course"} />
          <Badge variant={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</Badge>
          {a.source !== "manual" && <Badge variant="outline" className="capitalize">{a.source}</Badge>}
        </div>
        <h2 className="text-xl font-semibold leading-snug tracking-tight">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" title={where}
              className={cn("group/title inline-flex items-baseline gap-1.5 underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary", done && "text-muted-foreground")}>
              {a.title}<ExternalLink className="size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-colors group-hover/title:text-primary" aria-label={where} />
            </a>
          ) : <span className={cn(done && "text-muted-foreground line-through")}>{a.title}</span>}
        </h2>
        {!link && a.source === "canvas" && <p className="mt-1 text-xs text-muted-foreground">No Canvas link was saved for this one. Sync Canvas again to add it.</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl border bg-muted/40 p-4">
        <Detail label="Due">
          {a.due_at ? <span className="flex flex-wrap items-center gap-1.5">{formatDue(a.due_at)}{cd && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", URGENCY_STYLE[cd.urgency])}>{cd.text}</span>}</span> : <span className="text-muted-foreground">No due date</span>}
        </Detail>
        <Detail label="Type">{TYPE_LABEL[a.type]}</Detail>
        <Detail label="Priority"><Badge variant={PRIORITY_BADGE[a.priority]} className="capitalize">{a.priority}</Badge></Detail>
        <Detail label="Points">{a.points_possible !== null ? `${a.points_possible}${a.is_extra_credit ? " (extra credit)" : ""}` : <span className="text-muted-foreground">Not set</span>}</Detail>
        <Detail label="Grading category">{category?.name ?? <span className="text-muted-foreground">None</span>}</Detail>
        <Detail label="Estimated time">{a.estimated_minutes ? (a.estimated_minutes >= 60 ? `${Math.round(a.estimated_minutes / 6) / 10} h` : `${a.estimated_minutes} min`) : <span className="text-muted-foreground">Not set</span>}</Detail>
      </dl>

      {a.description?.trim() && <div><p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{a.description}</p></div>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="outline" onClick={toggle} loading={pending}>{done ? <><RotateCcw /> Mark not done</> : <><CheckCircle2 /> Mark complete</>}</Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" onClick={onEdit}><Pencil /> Edit</Button>
        </div>
      </div>
    </div>
  );
}

// Mounted only while the dialog is open, so its state is fresh each time.
function AssignmentForm({ onOpenChange, onCancel, courses, categories, assignment, defaultCourseId, defaultDue }: Props & { onCancel?: () => void }) {
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
          <Button type="button" variant="outline" onClick={() => (onCancel ? onCancel() : onOpenChange(false))}>Cancel</Button>
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
