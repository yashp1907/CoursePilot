import type { Assignment, Course, UserSettings } from "@/types/database";

export interface NotificationDraft { kind: string; title: string; body: string | null; dedupe_key: string; link: string }

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_PER_KIND = 3;

type Prefs = Pick<UserSettings, "notify_deadlines" | "notify_overdue" | "notify_exams" | "deadline_lead_hours">;
const open = (a: Assignment) => a.status !== "completed" && a.status !== "submitted";

/**
 * Deterministic reminders from real data. Every draft has a stable dedupe_key so re-running never repeats
 * a notification, and each kind is capped (with a single summary) to avoid noise.
 * Delivery is separate: today these become in-app rows; email/push can consume the same drafts later.
 */
export function generateNotifications(now: Date, assignments: Assignment[], courses: Course[], prefs: Prefs): NotificationDraft[] {
  const label = (a: Assignment) => { const c = courses.find((x) => x.id === a.course_id); return `${c?.code ?? c?.name ?? "Course"} ${a.title}`; };
  const link = (a: Assignment) => `/courses/${a.course_id}?tab=assignments`;
  const out: NotificationDraft[] = [];
  const today = now.toISOString().slice(0, 10);
  const items = assignments.filter((a) => open(a) && a.due_at && !a.is_demo);

  if (prefs.notify_deadlines) {
    const lead = prefs.deadline_lead_hours * HOUR;
    const soon = items.filter((a) => { const t = +new Date(a.due_at!); return t > +now && t - +now <= lead && a.type !== "exam"; }).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
    for (const a of soon.slice(0, MAX_PER_KIND)) {
      const hrs = Math.max(1, Math.round((+new Date(a.due_at!) - +now) / HOUR));
      out.push({ kind: "deadline_soon", title: `Due in ${hrs < 48 ? `${hrs}h` : `${Math.round(hrs / 24)} days`}`, body: label(a), dedupe_key: `due-soon:${a.id}:${a.due_at}`, link: link(a) });
    }
    if (soon.length > MAX_PER_KIND) out.push({ kind: "deadline_soon", title: `${soon.length - MAX_PER_KIND} more deadlines coming up`, body: "Open Assignments to see everything due soon.", dedupe_key: `due-soon-more:${today}:${soon.length}`, link: "/assignments" });
  }

  if (prefs.notify_overdue) {
    const overdue = items.filter((a) => { const t = +new Date(a.due_at!); return t < +now && +now - t <= 14 * DAY && a.type !== "study"; });
    for (const a of overdue.slice(0, MAX_PER_KIND)) out.push({ kind: "overdue", title: "Overdue", body: label(a), dedupe_key: `overdue:${a.id}:${a.due_at}`, link: link(a) });
    if (overdue.length > MAX_PER_KIND) out.push({ kind: "overdue", title: `${overdue.length - MAX_PER_KIND} more overdue assignments`, body: "Open Assignments to catch up.", dedupe_key: `overdue-more:${today}:${overdue.length}`, link: "/assignments" });
  }

  if (prefs.notify_exams) {
    const exams = items.filter((a) => { const t = +new Date(a.due_at!); return a.type === "exam" && t > +now && t - +now <= 7 * DAY; }).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
    for (const a of exams.slice(0, MAX_PER_KIND)) {
      const days = Math.ceil((+new Date(a.due_at!) - +now) / DAY);
      out.push({ kind: "exam_soon", title: days <= 1 ? "Exam within a day" : `Exam in ${days} days`, body: label(a), dedupe_key: `exam:${a.id}:${a.due_at}`, link: link(a) });
    }
  }
  return out;
}
