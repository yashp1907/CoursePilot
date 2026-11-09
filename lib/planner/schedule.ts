export interface PlanTask { id: string; title: string; courseId: string | null; minutes: number; due: string | null /* ISO */; priority: number }
export interface DayPlan { date: string; capacityMinutes: number; usedMinutes: number; blocks: { taskId: string; title: string; minutes: number }[] }
export interface WeekPlan { days: DayPlan[]; atRisk: { taskId: string; title: string; shortfallMinutes: number; reason: string }[]; unscheduledMinutes: number }

/** YYYY-MM-DD of an instant in a timezone. */
export function dayKey(d: Date, tz: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

/** Hours available per weekday (Mon..Sun). When unset, spread the weekly total evenly. */
export function availabilityFor(dates: string[], weeklyHours: number, perWeekday: number[] | null): number[] {
  return dates.map((d) => {
    if (perWeekday && perWeekday.length === 7) {
      const dow = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
      return Math.max(0, perWeekday[dow] ?? 0) * 60;
    }
    return Math.round((Math.max(0, weeklyHours) / 7) * 60);
  });
}

/**
 * Greedy earliest-deadline-first scheduler. Each task is placed on the earliest days with free capacity
 * that are on or before its due date (overdue or same-day tasks go on day 1). Whatever cannot fit before the
 * deadline is reported as at risk instead of being silently pushed past it. Undated tasks fill leftover time.
 */
export function planWeek(tasks: PlanTask[], dates: string[], capacityMinutes: number[], tz: string): WeekPlan {
  const days: DayPlan[] = dates.map((date, i) => ({ date, capacityMinutes: capacityMinutes[i] ?? 0, usedMinutes: 0, blocks: [] }));
  const atRisk: WeekPlan["atRisk"] = [];
  let unscheduled = 0;
  const order = [...tasks].sort((a, b) => {
    const da = a.due ? +new Date(a.due) : Infinity, db = b.due ? +new Date(b.due) : Infinity;
    return da - db || b.priority - a.priority;
  });
  for (const t of order) {
    let left = Math.max(0, Math.round(t.minutes));
    const dueDay = t.due ? dayKey(new Date(t.due), tz) : null;
    for (const d of days) {
      if (left <= 0) break;
      if (dueDay && d.date > dueDay && d !== days[0]) break; // can't schedule after the deadline
      const free = d.capacityMinutes - d.usedMinutes;
      if (free <= 0) continue;
      const take = Math.min(free, left);
      d.blocks.push({ taskId: t.id, title: t.title, minutes: take });
      d.usedMinutes += take; left -= take;
    }
    if (left > 0) {
      if (dueDay && dueDay <= (dates[dates.length - 1] ?? "")) atRisk.push({ taskId: t.id, title: t.title, shortfallMinutes: left, reason: "Not enough available time before the deadline" });
      else unscheduled += left; // due after this window; will be planned in a later week
    }
  }
  return { days, atRisk, unscheduledMinutes: unscheduled };
}
