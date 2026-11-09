import { differenceInCalendarDays, format, isThisYear, isToday, isTomorrow, isYesterday } from "date-fns";
import type { Assignment, DisplayStatus } from "@/types/database";

export function displayStatus(a: Pick<Assignment, "status" | "due_at">, now = new Date()): DisplayStatus {
  if (a.status === "completed" || a.status === "submitted") return a.status;
  if (a.due_at && new Date(a.due_at) < now) return "overdue";
  return a.status;
}

export function formatDue(iso: string | null, now = new Date()): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  const days = differenceInCalendarDays(d, now);
  if (days > 0 && days < 7) return `${format(d, "EEE")}, ${time}`;
  return `${format(d, isThisYear(d) ? "MMM d" : "MMM d, yyyy")}, ${time}`;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  submitted: "Submitted",
  overdue: "Overdue",
};

export const TYPE_LABEL: Record<string, string> = {
  homework: "Homework", quiz: "Quiz", exam: "Exam", project: "Project", paper: "Paper",
  lab: "Lab", reading: "Reading", presentation: "Presentation", study: "Study", other: "Other",
};

/** Convert a datetime-local input value to ISO using the browser's timezone. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}
