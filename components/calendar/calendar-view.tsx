"use client";
import { useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AssignmentDialog } from "@/components/assignments/assignment-dialog";
import { EventDialog } from "./event-dialog";
import { buildCalItems, DayList, MonthGrid, WeekView, type CalItem } from "./calendar-core";
import type { Assignment, CalendarEvent, Course, GradingCategoryRow } from "@/types/database";

type Mode = "month" | "week" | "day";

export function CalendarView({ assignments, events, courses, categories }: { assignments: Assignment[]; events: CalendarEvent[]; courses: Course[]; categories: GradingCategoryRow[] }) {
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [courseFilter, setCourseFilter] = useState("");
  const [assignDlg, setAssignDlg] = useState<Assignment | null>(null);
  const [eventDlg, setEventDlg] = useState<{ open: boolean; event: CalendarEvent | null }>({ open: false, event: null });

  const items = useMemo(() => {
    const all = buildCalItems(assignments, events, courses);
    return courseFilter ? all.filter((i) => i.courseId === courseFilter) : all;
  }, [assignments, events, courses, courseFilter]);

  const shift = (dir: 1 | -1) => setCursor((c) => (mode === "month" ? addMonths(c, dir) : mode === "week" ? addWeeks(c, dir) : addDays(c, dir)));
  const title = mode === "month" ? format(cursor, "MMMM yyyy") : mode === "week"
    ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), "MMM d, yyyy")}` : format(cursor, "EEEE, MMMM d, yyyy");
  const click = (i: CalItem) => (i.assignment ? setAssignDlg(i.assignment) : setEventDlg({ open: true, event: i.event ?? null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-base font-semibold">{title}</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft /></Button>
          <Button variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()); }}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => shift(1)}><ChevronRight /></Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Filter by course" className="w-auto" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}
          </NativeSelect>
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {(["month", "week", "day"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                className={cn("rounded px-2.5 py-1 text-sm font-medium capitalize cursor-pointer", mode === m ? "bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground")}>{m}</button>
            ))}
          </div>
          <Button onClick={() => setEventDlg({ open: true, event: null })}><Plus /> New event</Button>
        </div>
      </div>

      {mode === "month" && (
        <>
          <MonthGrid month={startOfMonth(cursor)} items={items} selected={selected} onSelect={(d) => { setSelected(d); setCursor(d); }} onItemClick={click} />
          <DayList day={selected} items={items} onItemClick={click} />
        </>
      )}
      {mode === "week" && <WeekView anchor={cursor} items={items} onSelect={(d) => { setSelected(d); setCursor(d); setMode("day"); }} onItemClick={click} />}
      {mode === "day" && <DayList day={cursor} items={items} onItemClick={click} emptyHint="Nothing scheduled. Enjoy the free time." />}

      <AssignmentDialog open={!!assignDlg} onOpenChange={(o) => !o && setAssignDlg(null)} courses={courses} categories={categories} assignment={assignDlg} />
      <EventDialog open={eventDlg.open} onOpenChange={(o) => setEventDlg((d) => ({ ...d, open: o }))} courses={courses} event={eventDlg.event} defaultDay={selected} />
    </div>
  );
}
