"use client";
import { useMemo, useState, useTransition } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, KanbanSquare, List, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { CourseChip } from "@/components/ui/course-chip";
import { courseHex } from "@/lib/utils/colors";
import { cn } from "@/lib/utils";
import { setAssignmentStatus } from "@/lib/actions/assignments";
import { run } from "@/lib/utils/action";
import { displayStatus, formatDue, STATUS_LABEL, TYPE_LABEL } from "@/lib/utils/dates";
import { AssignmentDialog } from "./assignment-dialog";
import { DuplicatesBanner } from "./duplicates-banner";
import { findDuplicatePairs } from "@/lib/duplicates";
import { EMPTY_FILTERS, filterAssignments, sortAssignments, type Filters, type SortKey } from "./filters";
import { buildCalItems, DayList, MonthGrid } from "@/components/calendar/calendar-core";
import type { Assignment, AssignmentStatus, Course, DisplayStatus, GradingCategoryRow } from "@/types/database";

type View = "list" | "kanban" | "calendar";

const STATUS_VARIANT: Record<DisplayStatus, "default" | "primary" | "success" | "danger" | "warning"> = {
  not_started: "default", in_progress: "primary", completed: "success", submitted: "success", overdue: "danger",
};
const PRIORITY_VARIANT = { high: "danger", medium: "warning", low: "default" } as const;
const COLUMNS: { status: AssignmentStatus; label: string }[] = [
  { status: "not_started", label: "Not started" }, { status: "in_progress", label: "In progress" },
  { status: "submitted", label: "Submitted" }, { status: "completed", label: "Completed" },
];

export function AssignmentsView({ assignments, courses, categories, lockedCourseId, initialView = "list" }: {
  assignments: Assignment[]; courses: Course[]; categories: GradingCategoryRow[]; lockedCourseId?: string; initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, course: lockedCourseId ?? "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const [dialog, setDialog] = useState<{ open: boolean; assignment: Assignment | null; due?: string }>({ open: false, assignment: null });
  const [overrides, setOverrides] = useState<Record<string, AssignmentStatus>>({});
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [, start] = useTransition();

  const [seen, setSeen] = useState(assignments);
  if (seen !== assignments) { setSeen(assignments); setOverrides({}); }

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const effective = useMemo(() => assignments.map((a) => (overrides[a.id] ? { ...a, status: overrides[a.id] } : a)), [assignments, overrides]);
  const filtered = useMemo(() => filterAssignments(effective, filters), [effective, filters]);
  const sorted = useMemo(() => sortAssignments(filtered, sort.key, sort.dir, courses), [filtered, sort, courses]);
  const hasFilters = JSON.stringify({ ...filters, course: lockedCourseId ? "" : filters.course }) !== JSON.stringify({ ...EMPTY_FILTERS });
  const setF = (k: keyof Filters, v: string) => setFilters((p) => ({ ...p, [k]: v }));

  function changeStatus(a: Assignment, status: AssignmentStatus) {
    if (a.status === status) return;
    setOverrides((o) => ({ ...o, [a.id]: status }));
    start(async () => {
      const r = await run(setAssignmentStatus(a.id, status));
      if (!r.ok) setOverrides((o) => { const n = { ...o }; delete n[a.id]; return n; });
    });
  }
  const toggle = (a: Assignment) => changeStatus(a, a.status === "completed" || a.status === "submitted" ? "not_started" : "completed");
  const open = (a: Assignment | null, due?: string) => setDialog({ open: true, assignment: a, due });

  const sortBtn = (key: SortKey, label: string) => (
    <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer">
      {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  const dupPairs = useMemo(() => {
    const dismissed = new Set(courses.flatMap((c) => ((c.settings as { dismissed_pairs?: string[] } | null)?.dismissed_pairs ?? [])));
    return findDuplicatePairs(assignments.filter((a) => !lockedCourseId || a.course_id === lockedCourseId), dismissed);
  }, [assignments, courses, lockedCourseId]);

  // Default list view reads top-down by urgency: overdue, upcoming, undated, then completed (collapsed).
  const [showDone, setShowDone] = useState(false);
  const grouped = sort.key === "due" && sort.dir === 1 && !filters.status;
  const sections = useMemo(() => {
    const now = new Date();
    const stat = (a: Assignment) => displayStatus(a, now);
    const done = sorted.filter((a) => ["completed", "submitted"].includes(stat(a)));
    const overdue = sorted.filter((a) => stat(a) === "overdue");
    const rest = sorted.filter((a) => !done.includes(a) && !overdue.includes(a));
    return [
      { key: "overdue", label: "Overdue", tone: "danger", items: overdue, collapsible: false },
      { key: "upcoming", label: "Upcoming", tone: "", items: rest.filter((a) => a.due_at), collapsible: false },
      { key: "nodate", label: "No due date", tone: "", items: rest.filter((a) => !a.due_at), collapsible: false },
      { key: "done", label: "Completed", tone: "", items: [...done].reverse(), collapsible: true },
    ].filter((x) => x.items.length > 0);
  }, [sorted]);

  const renderRow = (a: Assignment) => {
    const st = displayStatus(a); const c = courseMap.get(a.course_id); const done = st === "completed" || st === "submitted";
    return (
      <li key={a.id} className="grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-accent/40 md:grid-cols-[2rem_1fr_7rem_10rem_6rem_6rem]">
        <button onClick={() => toggle(a)} aria-label={done ? `Mark "${a.title}" not done` : `Mark "${a.title}" complete`} className="text-muted-foreground hover:text-primary cursor-pointer">
          {done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
        </button>
        <button onClick={() => open(a)} className="min-w-0 text-left cursor-pointer">
          <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{a.title}</p>
          <p className="truncate text-xs text-muted-foreground">{TYPE_LABEL[a.type]}{a.points_possible !== null ? ` · ${a.points_possible} pts` : ""}{a.estimated_minutes ? ` · ~${a.estimated_minutes} min` : ""}{a.source !== "manual" ? ` · from ${a.source}` : ""}</p>
        </button>
        <span className="col-start-2 flex md:col-start-auto"><CourseChip color={c?.color} label={c?.code ?? c?.name ?? "Course"} /></span>
        <span className={cn("col-start-2 text-xs md:col-start-auto", st === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>{formatDue(a.due_at)}</span>
        <span className="col-start-2 md:col-start-auto"><Badge variant={STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge></span>
        <span className="col-start-2 md:col-start-auto"><Badge variant={PRIORITY_VARIANT[a.priority]} className="capitalize">{a.priority}</Badge></span>
      </li>
    );
  };

  const calItems = useMemo(() => buildCalItems(sorted, [], courses), [sorted, courses]);

  return (
    <div className="space-y-4">
      <DuplicatesBanner pairs={dupPairs} courses={courses} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5" role="tablist" aria-label="View">
          {([["list", List, "List"], ["kanban", KanbanSquare, "Board"], ["calendar", CalendarDays, "Calendar"]] as const).map(([v, Icon, label]) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium cursor-pointer", view === v ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search…" aria-label="Search assignments" value={filters.q} onChange={(e) => setF("q", e.target.value)} />
        </div>
        <Button className="ml-auto" onClick={() => open(null)}><Plus /> New assignment</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {!lockedCourseId && (
          <NativeSelect aria-label="Course" className="w-auto" value={filters.course} onChange={(e) => setF("course", e.target.value)}>
            <option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}
          </NativeSelect>
        )}
        <NativeSelect aria-label="Status" className="w-auto" value={filters.status} onChange={(e) => setF("status", e.target.value)}>
          <option value="">Any status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Priority" className="w-auto" value={filters.priority} onChange={(e) => setF("priority", e.target.value)}>
          <option value="">Any priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </NativeSelect>
        <NativeSelect aria-label="Type" className="w-auto" value={filters.type} onChange={(e) => setF("type", e.target.value)}>
          <option value="">Any type</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">From
          <Input type="date" className="w-auto" value={filters.from} onChange={(e) => setF("from", e.target.value)} /></label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">To
          <Input type="date" className="w-auto" value={filters.to} onChange={(e) => setF("to", e.target.value)} /></label>
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS, course: lockedCourseId ?? "" })}><X /> Clear</Button>}
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="No assignments yet" description="Add one manually, or upload a syllabus to a course to import graded items and exam dates."
          action={<Button onClick={() => open(null)}><Plus /> Add assignment</Button>} />
      ) : filtered.length === 0 && view !== "calendar" ? (
        <EmptyState icon={<Search />} title="No assignments match these filters" action={<Button variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS, course: lockedCourseId ?? "" })}>Clear filters</Button>} />
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[2rem_1fr_7rem_10rem_6rem_6rem] items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span /><span>{sortBtn("title", "Assignment")}</span><span>{sortBtn("course", "Course")}</span><span>{sortBtn("due", "Due")}</span><span>Status</span><span>{sortBtn("priority", "Priority")}</span>
          </div>
          {grouped ? (
            <div>
              {sections.map((sec) => (
                <section key={sec.key}>
                  <button type="button" onClick={sec.collapsible ? () => setShowDone((v) => !v) : undefined} aria-expanded={sec.collapsible ? showDone : undefined}
                    className={cn("flex w-full items-center justify-between gap-2 border-y bg-muted/40 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide", sec.collapsible ? "cursor-pointer hover:bg-muted/70" : "cursor-default", sec.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
                    <span>{sec.label} <span className="ml-1 font-medium normal-case tracking-normal opacity-70">{sec.items.length}</span></span>
                    {sec.collapsible && <ChevronDown className={cn("size-4 transition-transform", !showDone && "-rotate-90")} />}
                  </button>
                  {(!sec.collapsible || showDone) && <ul className="divide-y">{sec.items.map(renderRow)}</ul>}
                </section>
              ))}
            </div>
          ) : <ul className="divide-y">{sorted.map(renderRow)}</ul>}
        </div>
      ) : view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const cards = sorted.filter((a) => a.status === col.status);
            return (
              <div key={col.status} className="rounded-lg border bg-muted/40 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const a = assignments.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (a) changeStatus(a, col.status); }}>
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1 text-xs font-semibold"><span>{col.label}</span><span className="text-muted-foreground">{cards.length}</span></div>
                <div className="min-h-16 space-y-2">
                  {cards.map((a) => {
                    const st = displayStatus(a); const c = courseMap.get(a.course_id);
                    return (
                      <div key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)} className="rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md" style={{ borderLeft: `4px solid ${courseHex(c?.color)}` }}>
                        <button onClick={() => open(a)} className="block w-full text-left cursor-pointer">
                          <p className="text-sm font-medium leading-snug">{a.title}</p>
                          <div className="mt-1.5"><CourseChip color={c?.color} label={c?.code ?? c?.name ?? "Course"} /></div>
                          <p className={cn("mt-1 text-xs", st === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>{formatDue(a.due_at)}</p>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant={PRIORITY_VARIANT[a.priority]} className="capitalize">{a.priority}</Badge>
                          <NativeSelect aria-label={`Move "${a.title}"`} className="h-7 w-auto py-0 text-xs" value={a.status} onChange={(e) => changeStatus(a, e.target.value as AssignmentStatus)}>
                            {COLUMNS.map((x) => <option key={x.status} value={x.status}>{x.label}</option>)}
                          </NativeSelect>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{format(month, "MMMM yyyy")}</h2>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}><ChevronLeft /></Button>
              <Button variant="outline" size="sm" onClick={() => { setMonth(startOfMonth(new Date())); setSelectedDay(new Date()); }}>Today</Button>
              <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight /></Button>
            </div>
          </div>
          <MonthGrid month={month} items={calItems} selected={selectedDay} onSelect={setSelectedDay} onItemClick={(i) => i.assignment && open(assignments.find((a) => a.id === i.assignment!.id) ?? null)} />
          <DayList day={selectedDay} items={calItems} onItemClick={(i) => i.assignment && open(assignments.find((a) => a.id === i.assignment!.id) ?? null)} emptyHint="Nothing due this day." />
        </div>
      )}

      <AssignmentDialog
        open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        courses={courses} categories={categories} assignment={dialog.assignment} defaultCourseId={lockedCourseId ?? (filters.course || undefined)} defaultDue={dialog.due}
      />
    </div>
  );
}

