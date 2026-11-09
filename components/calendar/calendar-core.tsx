"use client";
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { CheckCircle2, Circle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { courseHex, readable, tint } from "@/lib/utils/colors";
import { displayStatus } from "@/lib/utils/dates";
import type { Assignment, CalendarEvent, Course } from "@/types/database";

export interface CalItem {
  id: string;
  kind: "assignment" | "event";
  title: string;
  start: Date;
  allDay: boolean;
  courseId: string | null;
  courseLabel: string;
  color: string;
  done: boolean;
  overdue: boolean;
  isExam: boolean;
  assignment?: Assignment;
  event?: CalendarEvent;
}

export function buildCalItems(assignments: Assignment[], events: CalendarEvent[], courses: Course[], now = new Date()): CalItem[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const out: CalItem[] = [];
  for (const a of assignments) {
    if (!a.due_at) continue;
    const c = byId.get(a.course_id);
    const st = displayStatus(a, now);
    out.push({
      id: `a:${a.id}`, kind: "assignment", title: a.title, start: new Date(a.due_at), allDay: false, courseId: a.course_id,
      courseLabel: c?.code ?? c?.name ?? "Course", color: courseHex(c?.color), done: st === "completed" || st === "submitted",
      overdue: st === "overdue", isExam: a.type === "exam", assignment: a,
    });
  }
  for (const e of events) {
    const c = e.course_id ? byId.get(e.course_id) : undefined;
    out.push({
      id: `e:${e.id}`, kind: "event", title: e.title, start: new Date(e.starts_at), allDay: e.all_day, courseId: e.course_id,
      courseLabel: c?.code ?? c?.name ?? "Personal", color: c ? courseHex(c.color) : "#64748b", done: false, overdue: false,
      isExam: e.kind === "exam", event: e,
    });
  }
  return out.sort((a, b) => +a.start - +b.start);
}

export const itemsOn = (items: CalItem[], day: Date) => items.filter((i) => isSameDay(i.start, day));

function Chip({ item, onClick }: { item: CalItem; onClick: (i: CalItem) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(item); }}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium cursor-pointer transition hover:brightness-95",
        item.done && "opacity-50 line-through",
      )}
      style={{ backgroundColor: tint(item.color, 16), color: readable(item.color), boxShadow: `inset 3px 0 0 ${item.color}` }}
      title={`${item.courseLabel}: ${item.title}`}
    >
      <span className="truncate">{item.isExam ? "★ " : ""}{item.title}</span>
    </button>
  );
}

export function MonthGrid({ month, items, selected, onSelect, onItemClick }: {
  month: Date; items: CalItem[]; selected: Date; onSelect: (d: Date) => void; onItemClick: (i: CalItem) => void;
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = itemsOn(items, day);
          const sel = isSameDay(day, selected);
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              aria-label={`${format(day, "EEEE, MMMM d")}, ${dayItems.length} items`}
              onClick={() => onSelect(day)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(day); } }}
              className={cn("min-h-16 border-b border-r p-1 cursor-pointer hover:bg-accent/50 sm:min-h-28 [&:nth-child(7n)]:border-r-0", !isSameMonth(day, month) && "bg-muted/30 text-muted-foreground", sel && "bg-primary-soft/60")}
            >
              <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", isToday(day) && "bg-primary font-semibold text-primary-foreground")}>{format(day, "d")}</div>
              <div className="hidden space-y-0.5 sm:block">
                {dayItems.slice(0, 3).map((i) => <Chip key={i.id} item={i} onClick={onItemClick} />)}
                {dayItems.length > 3 && <p className="px-1 text-xs text-muted-foreground">+{dayItems.length - 3} more</p>}
              </div>
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {dayItems.slice(0, 4).map((i) => <span key={i.id} className="size-1.5 rounded-full" style={{ backgroundColor: i.color }} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ItemRow({ item, onClick }: { item: CalItem; onClick: (i: CalItem) => void }) {
  return (
    <button onClick={() => onClick(item)} className="flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left hover:bg-accent/50 cursor-pointer">
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", item.done && "text-muted-foreground line-through")}>{item.isExam ? "★ " : ""}{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.courseLabel}{item.kind === "assignment" ? " · Assignment" : " · Event"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {item.overdue && <span className="font-medium text-destructive">Overdue</span>}
        {item.kind === "assignment" ? (item.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4" />) : <CalendarClock className="size-4" />}
        {item.allDay ? "All day" : format(item.start, "h:mm a")}
      </div>
    </button>
  );
}

export function DayList({ day, items, onItemClick, emptyHint }: { day: Date; items: CalItem[]; onItemClick: (i: CalItem) => void; emptyHint?: string }) {
  const list = itemsOn(items, day);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{format(day, "EEEE, MMMM d")}</h3>
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{emptyHint ?? "Nothing scheduled."}</p> : list.map((i) => <ItemRow key={i.id} item={i} onClick={onItemClick} />)}
    </div>
  );
}

export function WeekView({ anchor, items, onSelect, onItemClick }: { anchor: Date; items: CalItem[]; onSelect: (d: Date) => void; onItemClick: (i: CalItem) => void }) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const list = itemsOn(items, d);
        return (
          <div key={d.toISOString()} className={cn("rounded-lg border bg-card p-2", isToday(d) && "border-primary/50")}>
            <button onClick={() => onSelect(d)} className="mb-2 flex w-full items-baseline justify-between text-left cursor-pointer">
              <span className="text-xs font-medium uppercase text-muted-foreground">{format(d, "EEE")}</span>
              <span className={cn("text-sm font-semibold", isToday(d) && "text-primary")}>{format(d, "d")}</span>
            </button>
            <div className="space-y-1">
              {list.length === 0 && <p className="text-xs text-muted-foreground">-</p>}
              {list.map((i) => <Chip key={i.id} item={i} onClick={onItemClick} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
