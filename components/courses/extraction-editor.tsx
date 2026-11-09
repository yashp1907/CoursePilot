"use client";
import { useState, useTransition } from "react";
import { AlertTriangle, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/helpers";
import type { ApplyOpts } from "@/lib/server/apply-extraction";
import type { ApplyResult } from "@/lib/actions/syllabus";
import { run } from "@/lib/utils/action";
import { ASSIGNMENT_TYPES, type SyllabusExtraction } from "@/lib/ai/schemas";
import { TYPE_LABEL } from "@/lib/utils/dates";
import { zonedToUtcIso } from "@/lib/utils/tz";
import { planSyllabusImport, REASON_TEXT, type SyllabusItem } from "@/lib/syllabus-plan";
import type { Assignment } from "@/types/database";

type Basis = "explicit" | "inferred";
const COURSE_FIELDS: { key: keyof SyllabusExtraction["course"]; label: string; type?: string }[] = [
  { key: "name", label: "Course name" }, { key: "code", label: "Course code" }, { key: "professor", label: "Professor" },
  { key: "professor_email", label: "Email" }, { key: "office_hours", label: "Office hours" }, { key: "classroom", label: "Classroom" },
  { key: "semester", label: "Semester" }, { key: "credits", label: "Credits", type: "number" },
];
const POLICY_FIELDS: { key: keyof Omit<SyllabusExtraction["policies"], "other">; label: string }[] = [
  { key: "late_submission", label: "Late submission" }, { key: "drop_policy", label: "Drop policy" }, { key: "attendance", label: "Attendance" },
  { key: "extra_credit", label: "Extra credit" }, { key: "exam_policy", label: "Exam policy" }, { key: "grading_scale_notes", label: "Grading scale notes" },
];

function BasisBadge({ basis }: { basis: Basis }) {
  return basis === "explicit" ? <Badge variant="success">Stated</Badge> : <Badge variant="warning" title="Derived by the AI, not written directly. Please verify.">Inferred</Badge>;
}

/** Build the same import items the server builds, so the screen can show exactly what Apply will do. */
function buildItems(ex: SyllabusExtraction, tz: string) {
  const items: SyllabusItem[] = ex.assignments.map((a) => ({ title: a.title, type: a.type, due_at: a.due_date ? zonedToUtcIso(a.due_date, a.due_time, tz) : null, points: a.points, category: a.category, recurrence: a.recurrence, url: a.url }));
  const dateItem = new Map<number, number>();
  ex.important_dates.forEach((d, i) => {
    if (d.kind === "exam" && d.date) { dateItem.set(i, items.length); items.push({ title: d.title, type: "exam", due_at: zonedToUtcIso(d.date, d.time, tz), points: null, category: null, recurrence: null }); }
  });
  return { items, dateItem };
}

export interface ExtractionEditorProps {
  courseId: string; initial: SyllabusExtraction; /** change to reset the editor (e.g. a new extraction arrived) */ resetKey: string; existing: Assignment[];
  onSave: (courseId: string, ex: SyllabusExtraction) => Promise<ActionResult>;
  onApply: (courseId: string, ex: SyllabusExtraction, opts: Omit<ApplyOpts, "timeZone"> & { timeZone?: string }) => Promise<ActionResult<ApplyResult>>;
  applied: boolean; applyLabel?: string;
  /** Sources whose existing dates this import may correct (course websites correct older syllabus dates). */
  updatableSources?: string[];
  /** Wording: where this data came from. */
  noun?: "syllabus" | "course website";
  /** Overwriting the course's own name/professor is off by default for websites. */
  defaultUpdateCourse?: boolean;
}

export function ExtractionEditor({ courseId, initial, resetKey, existing, onSave, onApply, applied, applyLabel = "Apply to course", updatableSources, noun = "syllabus", defaultUpdateCourse = true }: ExtractionEditorProps) {
  const [ex, setEx] = useState<SyllabusExtraction>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [updateCourse, setUpdateCourse] = useState(defaultUpdateCourse);
  const [importCats, setImportCats] = useState(true);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  // Pre-select only what is genuinely new (or corrects a date): items already in Canvas / your list start unchecked.
  const defaultSel = (e: SyllabusExtraction) => {
    const { items, dateItem } = buildItems(e, tz);
    const plan = planSyllabusImport(existing, items, items.map((_, i) => i), { updatableSources });
    const fresh = new Set([...plan.inserts.map((x) => x.index), ...plan.changes.map((c) => c.index)]);
    return { a: new Set(e.assignments.map((_, i) => i).filter((i) => fresh.has(i))), d: new Set(e.important_dates.flatMap((d, i) => (d.date && (d.kind !== "exam" || (dateItem.has(i) && fresh.has(dateItem.get(i)!))) ? [i] : []))) };
  };
  const [aSel, setASel] = useState<Set<number>>(() => defaultSel(initial).a);
  const [dSel, setDSel] = useState<Set<number>>(() => defaultSel(initial).d);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) { setSeenKey(resetKey); setEx(initial); setDirty(false); setASel(defaultSel(initial).a); setDSel(defaultSel(initial).d); }

  const edit = (fn: (d: SyllabusExtraction) => void) => { setEx((prev) => { const next = structuredClone(prev); fn(next); return next; }); setDirty(true); };

  const inferred = new Set(ex.inferred_fields);
  const weightTotal = ex.grading.categories.reduce((s, c) => s + (c.weight ?? 0), 0);
  const built = buildItems(ex, tz);
  const status = planSyllabusImport(existing, built.items, built.items.map((_, i) => i), { updatableSources });
  const skipFor = (itemIdx: number | undefined) => (itemIdx === undefined ? undefined : status.skipped.find((x) => x.index === itemIdx));
  const enrichFor = (itemIdx: number | undefined) => { const sk = skipFor(itemIdx); return sk?.matchedTitle ? status.enrich.find((e) => e.title === sk.matchedTitle) : undefined; };
  const StatusBadge = ({ idx }: { idx: number | undefined }) => {
    const sk = skipFor(idx); if (!sk) return null;
    const en = enrichFor(idx); const chg = status.changes.find((c) => c.index === idx);
    const fmtD = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return (<span className="flex flex-wrap items-center gap-1"><Badge variant="primary" title={sk.matchedTitle ? `Matches "${sk.matchedTitle}"` : undefined}>{REASON_TEXT[sk.reason]}{sk.matchedTitle ? `: ${sk.matchedTitle}` : ""}</Badge>{en && (en.patch.due_at || en.patch.points_possible !== undefined) && <Badge variant="success">Will fill missing {en.patch.due_at ? "date" : "points"}</Badge>}{chg && <Badge variant="warning" title="The newer source has a different date. Applying updates it (never for Canvas items or dates you edited).">Date changes: {fmtD(chg.from)} → {fmtD(chg.to)}</Badge>}</span>);
  };

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, i: number) {
    const n = new Set(set); if (n.has(i)) n.delete(i); else n.add(i); setter(n);
  }

  function save() {
    start(async () => {
      const r = await run(onSave(courseId, ex), "Edits saved");
      if (r.ok) setDirty(false);
    });
  }
  function apply() {
    start(async () => {
      const r = await run(onApply(courseId, ex, {
        updateCourse, importCategories: importCats, assignmentIdx: [...aSel], dateIdx: [...dSel],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
      if (r.ok) {
        const d = r.data;
        toast.success(`Added ${d.assignments} assignment${d.assignments === 1 ? "" : "s"}, ${d.events} date${d.events === 1 ? "" : "s"}${d.categories ? `, ${d.categories} grading categories` : ""}.${d.skipped ? ` Skipped ${d.skipped} already in ${d.inCanvas ? "Canvas or " : ""}your list` : ""}${d.enriched ? `; filled missing details on ${d.enriched}` : ""}.`);
        setDirty(false);
      }
    });
  }

  return (
    <div className="space-y-5">
      {ex.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-warning"><AlertTriangle className="size-4" /> Please verify</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <Card>
        <CardHeader><div><CardTitle>Course details</CardTitle><CardDescription>Fields the {noun} didn&apos;t state are left empty. Nothing is guessed.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {COURSE_FIELDS.map(({ key, label, type }) => (
            <div key={key} className="space-y-1.5">
              <Label className="flex items-center gap-2">{label}{inferred.has(key) && <Badge variant="warning">Inferred</Badge>}</Label>
              <Input type={type} step={type ? "0.5" : undefined} placeholder="Not provided" value={ex.course[key] ?? ""}
                onChange={(e) => edit((d) => { (d.course as Record<string, unknown>)[key] = e.target.value === "" ? null : type ? Number(e.target.value) : e.target.value; })} />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} placeholder="Not provided" value={ex.course.description ?? ""} onChange={(e) => edit((d) => { d.course.description = e.target.value || null; })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Grading breakdown</CardTitle>
            <CardDescription>{ex.grading.categories.length ? <>Weights total <span className={Math.abs(weightTotal - 100) > 0.01 ? "font-medium text-warning" : "font-medium text-success"}>{weightTotal}%</span></> : "No grading breakdown found."} · Grading type: {ex.grading.type}</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => edit((d) => { d.grading.categories.push({ name: "", weight: null, drop_lowest: null, basis: "explicit", source_text: null }); })}><Plus /> Add</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {ex.grading.categories.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label="Category name" className="min-w-40 flex-1" value={c.name} placeholder="Category" onChange={(e) => edit((d) => { d.grading.categories[i].name = e.target.value; })} />
              <div className="flex items-center gap-1"><Input aria-label="Weight percent" type="number" min="0" max="100" step="any" className="w-20" value={c.weight ?? ""} placeholder="%" onChange={(e) => edit((d) => { d.grading.categories[i].weight = e.target.value === "" ? null : Number(e.target.value); })} /><span className="text-sm text-muted-foreground">%</span></div>
              <div className="flex items-center gap-1"><Input aria-label="Lowest dropped" type="number" min="0" className="w-16" value={c.drop_lowest ?? ""} placeholder="0" onChange={(e) => edit((d) => { d.grading.categories[i].drop_lowest = e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))); })} /><span className="text-xs text-muted-foreground">dropped</span></div>
              <BasisBadge basis={c.basis} />
              <Button variant="ghost" size="icon" aria-label="Remove category" onClick={() => edit((d) => { d.grading.categories.splice(i, 1); })}><Trash2 /></Button>
              {c.source_text && <p className="w-full pl-1 text-xs text-muted-foreground">“{c.source_text}”</p>}
            </div>
          ))}
          {ex.grading.scale.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Letter scale found: {ex.grading.scale.map((s) => `${s.letter} ≥ ${s.min}%`).join(", ")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Assignments &amp; exams</CardTitle><CardDescription>{noun === "syllabus" ? "Only items written in the syllabus. Most professors post homework in Canvas, so this list may be short." : "Everything due that was found on the website. Items already in your list start unchecked."}</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => { edit((d) => { d.assignments.push({ title: "", type: "homework", due_date: null, due_time: null, points: null, category: null, recurrence: null, basis: "explicit", source_text: null, url: null, weekday: null }); }); setASel((s) => new Set(s).add(ex.assignments.length)); }}><Plus /> Add</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {ex.assignments.length === 0 && <p className="text-sm text-muted-foreground">No dated assignments or exams were found in this syllabus.</p>}
          {ex.assignments.map((a, i) => (
            <div key={i} className="rounded-md border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input type="checkbox" aria-label={`Import ${a.title || "assignment"}`} className="size-4 accent-[var(--primary)]" checked={aSel.has(i)} onChange={() => toggle(aSel, setASel, i)} />
                <Input aria-label="Title" className="min-w-40 flex-1" value={a.title} placeholder="Title" onChange={(e) => edit((d) => { d.assignments[i].title = e.target.value; })} />
                <NativeSelect aria-label="Type" className="w-auto" value={a.type} onChange={(e) => edit((d) => { d.assignments[i].type = e.target.value as never; })}>
                  {ASSIGNMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </NativeSelect>
                <Input aria-label="Due date" type="date" className="w-auto" value={a.due_date ?? ""} onChange={(e) => edit((d) => { d.assignments[i].due_date = e.target.value || null; })} />
                <Input aria-label="Due time" type="time" className="w-auto" value={a.due_time ?? ""} onChange={(e) => edit((d) => { d.assignments[i].due_time = e.target.value || null; })} />
                <Input aria-label="Points" type="number" min="0" className="w-20" placeholder="pts" value={a.points ?? ""} onChange={(e) => edit((d) => { d.assignments[i].points = e.target.value === "" ? null : Number(e.target.value); })} />
                <BasisBadge basis={a.basis} />
                <StatusBadge idx={i} />
                {!a.due_date && <Badge variant="outline">No date given</Badge>}
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => { edit((d) => { d.assignments.splice(i, 1); }); setASel(new Set([...aSel].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)))); }}><Trash2 /></Button>
              </div>
              {(a.recurrence || a.category || a.source_text) && (
                <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                  {a.recurrence && <>Recurring: {a.recurrence}. </>}{a.category && <>Category: {a.category}. </>}{a.source_text && <>“{a.source_text}”</>}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {ex.important_dates.length > 0 && (
        <Card>
          <CardHeader><div><CardTitle>Important dates</CardTitle><CardDescription>Exams become assignments; holidays, breaks and milestones go on your calendar.</CardDescription></div></CardHeader>
          <CardContent className="space-y-2">
            {ex.important_dates.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input type="checkbox" aria-label={`Import ${d.title}`} className="size-4 accent-[var(--primary)]" checked={dSel.has(i)} disabled={!d.date} onChange={() => toggle(dSel, setDSel, i)} />
                <Input aria-label="Title" className="min-w-40 flex-1" value={d.title} onChange={(e) => edit((x) => { x.important_dates[i].title = e.target.value; })} />
                <Badge variant="outline" className="capitalize">{d.kind}</Badge>
                <Input aria-label="Date" type="date" className="w-auto" value={d.date ?? ""} onChange={(e) => { edit((x) => { x.important_dates[i].date = e.target.value || null; }); if (e.target.value) setDSel((s) => new Set(s).add(i)); }} />
                <BasisBadge basis={d.basis} />
                <StatusBadge idx={built.dateItem.get(i)} />
                {!d.date && <Badge variant="outline">No date given</Badge>}
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => { edit((x) => { x.important_dates.splice(i, 1); }); setDSel(new Set([...dSel].filter((v) => v !== i).map((v) => (v > i ? v - 1 : v)))); }}><Trash2 /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><div><CardTitle>Course policies</CardTitle><CardDescription>Summaries of what the {noun} says. Edit anything that looks wrong.</CardDescription></div></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {POLICY_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <Textarea rows={3} placeholder="Not provided" value={ex.policies[key] ?? ""} onChange={(e) => edit((d) => { d.policies[key] = e.target.value || null; })} />
            </div>
          ))}
          {ex.policies.other.map((p, i) => (
            <div key={i} className="space-y-1.5 sm:col-span-2"><Label>{p.title}</Label>
              <Textarea rows={2} value={p.text} onChange={(e) => edit((d) => { d.policies.other[i].text = e.target.value; })} /></div>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={updateCourse} onChange={(e) => setUpdateCourse(e.target.checked)} /> Update course details</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={importCats} onChange={(e) => setImportCats(e.target.checked)} /> Import grading categories</label>
          <span className="text-muted-foreground">{aSel.size} assignments · {dSel.size} dates</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={save} disabled={!dirty} loading={pending}><Save /> Save edits</Button>
          <Button onClick={apply} loading={pending}><Sparkles /> {applied ? "Apply again" : applyLabel}</Button>
        </div>
      </div>
    </div>
  );
}
