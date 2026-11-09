"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Moon, Plus, RefreshCw, Search, Sun } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CourseDot } from "@/components/ui/course-dot";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";
import type { Assignment, Course } from "@/types/database";

export interface PaletteAction { id: string; label: string; run: () => void }

interface Entry { id: string; group: string; label: string; sub?: string; icon: React.ReactNode; run: () => void }

export function CommandPalette({ open, onOpenChange, courses, assignments, actions, onOpenAssignment }: {
  open: boolean; onOpenChange: (o: boolean) => void; courses: Course[]; assignments: Assignment[]; actions: PaletteAction[]; onOpenAssignment: (a: Assignment) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet={false} title="Search and jump" description="Find pages, courses and assignments, or run an action." className="top-[20%] max-w-xl translate-y-0 p-0 [&>[data-dialog-header]]:sr-only">
        <PaletteBody close={() => onOpenChange(false)} courses={courses} assignments={assignments} actions={actions} onOpenAssignment={onOpenAssignment} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ close, courses, assignments, actions, onOpenAssignment }: { close: () => void; courses: Course[]; assignments: Assignment[]; actions: PaletteAction[]; onOpenAssignment: (a: Assignment) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const go = (href: string) => () => { close(); router.push(href); };

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...actions.map((a) => ({ id: `act:${a.id}`, group: "Actions", label: a.label, icon: a.id === "sync" ? <RefreshCw className="size-4" /> : a.id === "theme" ? <><Moon className="size-4 dark:hidden" /><Sun className="hidden size-4 dark:block" /></> : <Plus className="size-4" />, run: () => { close(); a.run(); } })),
      ...NAV.flatMap((s) => s.items).map((i) => ({ id: `nav:${i.href}`, group: "Go to", label: i.label, sub: i.hint, icon: <i.icon className="size-4" />, run: go(i.href) })),
      ...courses.map((c) => ({ id: `c:${c.id}`, group: "Courses", label: `${c.code ? c.code + " · " : ""}${c.name}`, icon: <CourseDot color={c.color} />, run: go(`/courses/${c.id}`) })),
      ...courses.flatMap((c) => [
        { id: `cg:${c.id}`, group: "Courses", label: `${c.code ?? c.name}: Grades & what-if`, icon: <CourseDot color={c.color} />, run: go(`/courses/${c.id}?tab=grades`) },
        { id: `ci:${c.id}`, group: "Courses", label: `${c.code ?? c.name}: Staff, office hours & links`, icon: <FileText className="size-4" />, run: go(`/courses/${c.id}?tab=info`) },
        { id: `cs:${c.id}`, group: "Courses", label: `${c.code ?? c.name}: Syllabus`, icon: <FileText className="size-4" />, run: go(`/courses/${c.id}?tab=syllabus`) },
      ]),
      ...assignments.map((a) => ({ id: `a:${a.id}`, group: "Assignments", label: a.title, sub: courses.find((c) => c.id === a.course_id)?.code ?? undefined, icon: <FileText className="size-4" />, run: () => { close(); onOpenAssignment(a); } })),
    ];
    const s = q.trim().toLowerCase();
    if (!s) return all.filter((e) => e.group === "Actions" || e.group === "Go to" || (e.group === "Courses" && e.id.startsWith("c:")));
    const terms = s.split(/\s+/);
    return all.filter((e) => terms.every((t) => `${e.label} ${e.sub ?? ""} ${e.group}`.toLowerCase().includes(t))).slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, courses, assignments, actions]);

  useEffect(() => { list.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, entries.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); entries[idx]?.run(); }
  };

  let lastGroup = "";
  return (
    <div onKeyDown={onKey}>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Search courses, assignments, pages…" aria-label="Search" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <kbd className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">esc</kbd>
      </div>
      <ul ref={list} className="max-h-80 overflow-y-auto p-1.5" role="listbox">
        {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{q}”.</li>}
        {entries.map((e, i) => {
          const header = e.group !== lastGroup ? (lastGroup = e.group) : null;
          return (
            <li key={e.id} role="presentation">
              {header && <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{header}</p>}
              <button data-i={i} role="option" aria-selected={i === idx} onMouseMove={() => setIdx(i)} onClick={e.run}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm cursor-pointer", i === idx && "bg-primary-soft text-primary")}>
                <span className="flex size-5 items-center justify-center text-muted-foreground">{e.icon}</span>
                <span className="min-w-0 flex-1 truncate">{e.label}{e.sub && <span className="ml-2 text-xs text-muted-foreground">{e.sub}</span>}</span>
                {i === idx && <CornerDownLeft className="size-3.5" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
