import type { CourseInfo } from "./schemas";

export const ROLE_LABEL: Record<CourseInfo["people"][number]["role"], string> = {
  instructor: "Instructor", ta: "Graduate TA (GSI)", ia: "Instructional assistant", grader: "Grader", coordinator: "Coordinator", other: "Staff",
};
export const GROUP_TITLE: Record<string, string> = { instructor: "Instructors", coordinator: "Coordinators", ta: "Graduate TAs / GSIs", ia: "Instructional assistants (IAs)", grader: "Graders", other: "Other staff" };

/** Group the teaching team in display order (only non-empty groups). */
export function groupPeople(people: CourseInfo["people"]) {
  return ["instructor", "coordinator", "ta", "ia", "grader", "other"].map((role) => ({ role, title: GROUP_TITLE[role], people: people.filter((p) => p.role === role) })).filter((g) => g.people.length > 0);
}

const FULL: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const COMPACT_DAY: Record<string, number> = { su: 0, m: 1, tu: 2, t: 2, w: 3, th: 4, r: 4, f: 5, sa: 6, s: 6, u: 0 };

/**
 * "Mon/Wed", "MWF", "TuTh", "Tuesday and Thursday", "Mon, Wed 10-11" -> weekday indexes (0 = Sunday).
 * Whole day names win; compact forms ("MWF", "TTh") are read only for tokens made purely of day letters.
 */
export function parseDays(text: string | null | undefined): number[] {
  if (!text) return [];
  const found = new Set<number>();
  for (const word of text.toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter(Boolean)) {
    const singular = word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word;   // "Tuesdays" -> "Tuesday"
    if (word in FULL) { found.add(FULL[word]); continue; }
    if (singular in FULL) { found.add(FULL[singular]); continue; }
    if (word.length <= 8 && /^(?:tu|th|sa|su|m|t|w|f|r|s|u)+$/.test(word)) {
      for (const tok of word.match(/tu|th|sa|su|m|t|w|f|r|s|u/g) ?? []) found.add(COMPACT_DAY[tok]);
    }
  }
  return [...found].sort();
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  const f = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`; };
  if (start && end) return `${f(start)} – ${f(end)}`;
  return start ? f(start) : null;
}

export interface TodayClass { courseId: string; kind: string; title: string | null; start: string | null; end: string | null; location: string | null; time: string | null }

/** Class meetings that fall on a given weekday (0 = Sunday), earliest first. Office hours and exams are excluded. */
export function classesOnWeekday(courses: { courseId: string; meetings: CourseInfo["meetings"] }[], weekday: number): TodayClass[] {
  const out: TodayClass[] = [];
  for (const c of courses) for (const m of c.meetings) {
    if (!["lecture", "lab", "discussion", "recitation"].includes(m.kind)) continue;
    if (!parseDays(m.days).includes(weekday)) continue;
    out.push({ courseId: c.courseId, kind: m.kind, title: m.title, start: m.start_time, end: m.end_time, location: m.location, time: formatTimeRange(m.start_time, m.end_time) });
  }
  return out.sort((a, b) => (a.start ?? "99:99").localeCompare(b.start ?? "99:99"));
}

/** A one-line "next class" summary for compact displays. */
export function describeMeeting(m: CourseInfo["meetings"][number]): string {
  return [m.days, formatTimeRange(m.start_time, m.end_time), m.location].filter(Boolean).join(" · ");
}

// ---- Links: show the useful ones, not Canvas's own navigation or boilerplate ---------------------------------------

const CANVAS_NAV = new Set(["home", "announcements", "assignments", "quizzes", "files", "grades", "people", "syllabus", "modules", "discussions", "pages", "outcomes", "rubrics", "collaborations", "conferences", "chat", "settings", "course home"]);
const CANVAS_PATH = /^\/courses\/\d+(?:\/(?:assignments|grades|users|files|quizzes|announcements|modules|pages|discussion_topics|assignments\/syllabus|outcomes|collaborations|conferences|settings))?\/?$/;
// Working tools first; textbooks last (they also appear under "Grading, facts & textbooks").
const KIND_ORDER = ["forum", "gradescope", "meeting", "autograder", "calendar", "notes", "resource", "other", "textbook"];

/** Remove Canvas's accessibility boilerplate ("Links to an external site.") and tidy whitespace. */
export function cleanLinkLabel(label: string): string {
  return label.replace(/\s*(?:links? to an external site|opens in a new window|link opens in a new tab)\.?\s*$/i, "").replace(/\s+/g, " ").trim();
}

type Link = CourseInfo["links"][number];

const isCanvasHost = (host: string, canvasHosts: string[]) => host.endsWith("instructure.com") || canvasHosts.includes(host);

/** The school's own Canvas host(s), learned from Canvas's own tab URLs (internal tabs, and /external_tools/ links), never from the tools themselves. */
export function canvasHostsFrom(tabs: { url: string | null; external: boolean }[]): string[] {
  const hosts = new Set<string>();
  for (const t of tabs) {
    if (!t.url) continue;
    try { const u = new URL(t.url); if (!t.external || /\/external_tools\//.test(u.pathname)) hosts.add(u.hostname); } catch { /* ignore */ }
  }
  return [...hosts];
}

/** Canvas's built-in navigation (Home, Grades, People…). Only links on the school's own Canvas host can be "navigation". */
export function isCanvasNav(label: string, url: string, canvasHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (!isCanvasHost(u.hostname, canvasHosts)) return false;       // e.g. gradescope.com/courses/9 is a real tool, not Canvas navigation
  return CANVAS_NAV.has(cleanLinkLabel(label).toLowerCase()) || CANVAS_PATH.test(u.pathname);
}

/**
 * Clean, de-duplicate and rank links: no Canvas built-in navigation, no boilerplate, no near-duplicates
 * ("Download X" vs "X"), tools like forums and Gradescope first. `primary` is what to show up front.
 */
export function curateLinks(links: Link[], primaryCount = 8, canvasHosts: string[] = []): { all: Link[]; primary: Link[]; more: Link[] } {
  const seen = new Set<string>();
  const all: Link[] = [];
  for (const l of links) {
    const label = cleanLinkLabel(l.label);
    if (!label || isCanvasNav(label, l.url, canvasHosts)) continue;
    const key = `${label.toLowerCase().replace(/^download\s+/, "")}|${l.url.replace(/\/$/, "").toLowerCase()}`;
    const labelKey = label.toLowerCase().replace(/^download\s+/, "");
    if (seen.has(key) || seen.has(`label:${labelKey}`)) continue;
    seen.add(key); seen.add(`label:${labelKey}`);
    all.push({ ...l, label });
  }
  all.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { all, primary: all.slice(0, primaryCount), more: all.slice(primaryCount) };
}

// ---- Days -------------------------------------------------------------------------------------------------------

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tuesdays and Thursdays" -> "Tue/Thu"; five consecutive weekdays -> "Mon–Fri". Unparseable text is returned untouched. */
export function formatDays(text: string | null | undefined): string | null {
  if (!text) return null;
  const days = parseDays(text);
  if (!days.length) return text;
  if (days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1] + 1)) return `${SHORT[days[0]]}–${SHORT[days[days.length - 1]]}`;
  return days.map((d) => SHORT[d]).join("/");
}

const GENERIC_TITLE = /^(class(?: time)?s?|meeting(?: times?)?|lectures?|labs?|discussions?|recitations?|office hours?|sessions?|time|schedule)$/i;
export const isGenericTitle = (t: string | null | undefined) => !t || !t.trim() || GENERIC_TITLE.test(t.trim());
