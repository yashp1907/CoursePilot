"use client";
import { useState, useTransition } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reorderCourses } from "@/lib/actions/courses";
import { moveItem } from "@/lib/utils/reorder";
import { CourseCard } from "./course-card";
import type { CourseSummary } from "@/lib/course-stats";

export function CoursesGrid({ summaries }: { summaries: CourseSummary[] }) {
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<string[]>(() => summaries.map((s) => s.course.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [seen, setSeen] = useState(summaries);
  if (seen !== summaries && !dragId) { setSeen(summaries); setOrder(summaries.map((s) => s.course.id)); }

  const byId = new Map(summaries.map((s) => [s.course.id, s]));
  const list = order.map((id) => byId.get(id)).filter((x): x is CourseSummary => !!x);
  const serverOrder = summaries.map((s) => s.course.id);

  const persist = (next: string[]) => {
    if (next.join() === serverOrder.join()) return;
    startSave(async () => {
      const r = await reorderCourses(next);
      if (!r.ok) { toast.error(r.error); setOrder(serverOrder); }
    });
  };
  const move = (i: number, dir: -1 | 1) => { const next = moveItem(order, i, i + dir); setOrder(next); persist(next); };

  return (
    <div>
      {summaries.length > 1 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">{reordering ? "Drag a card, or use the arrows. Your order is saved automatically and used in the sidebar too." : ""}</p>
          <Button variant={reordering ? "default" : "outline"} size="sm" onClick={() => setReordering((r) => !r)} loading={saving}>
            {reordering ? <><Check /> Done</> : <><ArrowUpDown /> Reorder</>}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((s, i) => (
          <CourseCard
            key={s.course.id} s={s}
            reorder={reordering ? {
              index: i, total: list.length, dragging: dragId === s.course.id, onMove: (d) => move(i, d),
              dragHandlers: {
                draggable: true,
                onDragStart: (e) => { setDragId(s.course.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.course.id); },
                onDragEnter: () => { if (dragId && dragId !== s.course.id) setOrder((o) => moveItem(o, o.indexOf(dragId), o.indexOf(s.course.id))); },
                onDragOver: (e) => e.preventDefault(),
                onDrop: (e) => e.preventDefault(),
                onDragEnd: () => { setDragId(null); persist(order); },
              },
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
