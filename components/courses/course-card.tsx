"use client";
import { NavLink } from "@/components/ui/nav-link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateCourseColor } from "@/lib/actions/courses";
import { courseHex, readable, tint } from "@/lib/utils/colors";
import { formatDue } from "@/lib/utils/dates";
import { run } from "@/lib/utils/action";
import { ColorPopover } from "./color-picker";
import { GradeRing } from "./grade-ring";
import type { CourseSummary } from "@/lib/course-stats";

export interface ReorderProps {
  index: number; total: number; dragging: boolean;
  onMove: (dir: -1 | 1) => void;
  dragHandlers: { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnter: () => void; onDragOver: (e: React.DragEvent) => void; onDragEnd: () => void; onDrop: (e: React.DragEvent) => void };
}

export function CourseCard({ s, reorder }: { s: CourseSummary; reorder?: ReorderProps }) {
  const { course: c, grade } = s;
  const [color, setColor] = useState(c.color);
  const [seen, setSeen] = useState(c.color);
  if (seen !== c.color) { setSeen(c.color); setColor(c.color); }
  const [, start] = useTransition();
  const hex = courseHex(color);
  const pctDone = s.total ? (s.done / s.total) * 100 : 0;
  const name = c.code ?? c.name;

  const changeColor = (v: string) => {
    const prev = color; setColor(v);
    start(async () => { const r = await run(updateCourseColor(c.id, v)); if (!r.ok) setColor(prev); });
  };

  return (
    <article
      {...(reorder?.dragHandlers ?? {})}
      className={cn("group relative overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-200", reorder ? "cursor-grab active:cursor-grabbing ring-1 ring-dashed ring-border" : "hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-10px_rgba(15,23,42,0.22)]", reorder?.dragging && "scale-[0.97] opacity-50")}
    >
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${hex}, color-mix(in srgb, ${hex} 50%, transparent))` }} />
      {!reorder && <NavLink href={`/courses/${c.id}`} className="absolute inset-0 z-0 rounded-xl" aria-label={`Open ${name}: ${c.name}`} />}

      {/* The body ignores the pointer so the whole card is one big link; real controls opt back in. */}
      <div className="pointer-events-none relative z-10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide" style={{ backgroundColor: tint(color, 15), color: readable(color) }}>{c.code ?? "No code"}</span>
            {c.is_demo && <Badge variant="warning">Demo</Badge>}
            {c.credits !== null && <span className="text-xs text-muted-foreground">{c.credits} credits</span>}
          </div>
          {reorder ? (
            <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
              <span className="px-1 text-muted-foreground" aria-hidden><GripVertical className="size-4" /></span>
              <button type="button" aria-label={`Move ${name} earlier`} disabled={reorder.index === 0} onClick={() => reorder.onMove(-1)} className="rounded p-1 hover:bg-card disabled:opacity-30 cursor-pointer"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label={`Move ${name} later`} disabled={reorder.index === reorder.total - 1} onClick={() => reorder.onMove(1)} className="rounded p-1 hover:bg-card disabled:opacity-30 cursor-pointer"><ArrowDown className="size-4" /></button>
            </div>
          ) : (
            <div className="pointer-events-auto shrink-0"><ColorPopover value={color} onChange={changeColor} label={name} align="right" /></div>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight">{c.name}</h3>
            {c.professor && <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground"><User className="size-3.5 shrink-0" />{c.professor}</p>}
          </div>
          <GradeRing percent={grade.percent} letter={grade.letter} color={color} />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">{s.total === 0 ? "No assignments yet" : `${s.done} of ${s.total} done`}</span>
            {s.overdue > 0 && <span className="font-medium text-destructive">{s.overdue} overdue</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Assignments completed" aria-valuenow={Math.round(pctDone)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pctDone}%`, backgroundColor: hex }} />
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 border-t pt-3 text-[13px]">
          {s.next
            ? <p className="min-w-0 truncate"><span className="text-muted-foreground">Next: </span><span className="font-medium">{s.next.title}</span><span className="text-muted-foreground"> · {formatDue(s.next.due_at)}</span></p>
            : <p className="text-muted-foreground">Nothing upcoming</p>}
          {!reorder && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />}
        </div>
      </div>
    </article>
  );
}
