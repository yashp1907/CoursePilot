export type Urgency = "overdue" | "today" | "soon" | "week" | "later";

/** Human, glanceable distance to a due date ("in 5h", "Tomorrow", "3 days ago") plus an urgency level for color. */
export function countdown(iso: string, now = new Date()): { text: string; urgency: Urgency } {
  const ms = +new Date(iso) - +now;
  const mins = Math.round(Math.abs(ms) / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (ms < 0) {
    if (mins < 60) return { text: `${Math.max(mins, 1)}m overdue`, urgency: "overdue" };
    if (hrs < 24) return { text: `${hrs}h overdue`, urgency: "overdue" };
    return { text: `${days} day${days === 1 ? "" : "s"} overdue`, urgency: "overdue" };
  }
  if (mins < 60) return { text: `in ${Math.max(mins, 1)}m`, urgency: "today" };
  if (hrs < 24) return { text: `in ${hrs}h`, urgency: hrs < 12 ? "today" : "soon" };
  if (days === 1) return { text: "in 1 day", urgency: "soon" };
  if (days < 7) return { text: `in ${days} days`, urgency: days <= 2 ? "soon" : "week" };
  const w = Math.round(days / 7);
  return { text: days < 14 ? `in ${days} days` : `in ${w} weeks`, urgency: "later" };
}

export const URGENCY_STYLE: Record<Urgency, string> = {
  overdue: "bg-destructive/12 text-destructive",
  today: "bg-warning/15 text-warning",
  soon: "bg-warning/10 text-warning",
  week: "bg-primary-soft text-primary",
  later: "bg-muted text-muted-foreground",
};
