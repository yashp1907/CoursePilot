import { dayKey } from "./schedule";
import { estimateMinutes, isOpen } from "./priority";
import type { Assignment } from "@/types/database";

export interface WeekLoad { start: string; label: string; exams: number; others: number; minutes: number; total: number; busy: boolean }

const DAY = 86_400_000;

/** Start of the (Mon-based) week for a day key. */
function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Open work per calendar week (Mon-Sun) in the student's timezone. */
export function weeklyWorkload(assignments: Assignment[], now: Date, weeks: number, tz: string, weeklyCapacityMinutes?: number): WeekLoad[] {
  const first = weekStart(dayKey(now, tz));
  const starts = Array.from({ length: weeks }, (_, i) => new Date(+new Date(`${first}T12:00:00Z`) + i * 7 * DAY).toISOString().slice(0, 10));
  const rows: WeekLoad[] = starts.map((s) => ({ start: s, label: "", exams: 0, others: 0, minutes: 0, total: 0, busy: false }));
  for (const a of assignments) {
    if (!isOpen(a) || !a.due_at || a.type === "study") continue;
    const ws = weekStart(dayKey(new Date(a.due_at), tz));
    const row = rows.find((r) => r.start === ws);
    if (!row) continue;
    if (a.type === "exam") row.exams++; else row.others++;
    row.minutes += estimateMinutes(a).minutes;
  }
  for (const [i, r] of rows.entries()) {
    r.total = r.exams + r.others;
    r.label = i === 0 ? "This week" : i === 1 ? "Next week" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${r.start}T12:00:00Z`));
    r.busy = r.exams >= 2 || r.total >= 6 || (!!weeklyCapacityMinutes && r.minutes > weeklyCapacityMinutes);
  }
  return rows;
}

/** "You have 3 exams and 5 assignments due next week." Returns null when nothing is due. */
export function describeWeek(w: WeekLoad): string | null {
  if (w.total === 0) return null;
  const parts = [w.exams && `${w.exams} exam${w.exams === 1 ? "" : "s"}`, w.others && `${w.others} assignment${w.others === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
  return `You have ${parts} due ${w.label === "This week" ? "this week" : w.label === "Next week" ? "next week" : `the week of ${w.label}`}.`;
}
