import type { Assignment, Course, DisplayStatus } from "@/types/database";
import { displayStatus } from "@/lib/utils/dates";

export interface Filters { course: string; status: string; priority: string; type: string; from: string; to: string; q: string }
export const EMPTY_FILTERS: Filters = { course: "", status: "", priority: "", type: "", from: "", to: "", q: "" };
export type SortKey = "due" | "title" | "course" | "priority";

const PRI = { high: 0, medium: 1, low: 2 } as const;

export function filterAssignments(list: Assignment[], f: Filters, now = new Date()): Assignment[] {
  const from = f.from ? new Date(`${f.from}T00:00:00`) : null;
  const to = f.to ? new Date(`${f.to}T23:59:59`) : null;
  const q = f.q.trim().toLowerCase();
  return list.filter((a) => {
    if (f.course && a.course_id !== f.course) return false;
    if (f.status && displayStatus(a, now) !== (f.status as DisplayStatus)) return false;
    if (f.priority && a.priority !== f.priority) return false;
    if (f.type && a.type !== f.type) return false;
    if (q && !a.title.toLowerCase().includes(q)) return false;
    if (from || to) {
      if (!a.due_at) return false;
      const d = new Date(a.due_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });
}

export function sortAssignments(list: Assignment[], key: SortKey, dir: 1 | -1, courses: Course[]): Assignment[] {
  const code = new Map(courses.map((c) => [c.id, c.code ?? c.name]));
  return [...list].sort((a, b) => {
    let r = 0;
    if (key === "due") r = (a.due_at ? +new Date(a.due_at) : Infinity) - (b.due_at ? +new Date(b.due_at) : Infinity);
    else if (key === "title") r = a.title.localeCompare(b.title);
    else if (key === "course") r = (code.get(a.course_id) ?? "").localeCompare(code.get(b.course_id) ?? "");
    else r = PRI[a.priority] - PRI[b.priority];
    if (!Number.isFinite(r)) r = a.due_at ? -1 : b.due_at ? 1 : 0;
    return r * dir || a.title.localeCompare(b.title);
  });
}
