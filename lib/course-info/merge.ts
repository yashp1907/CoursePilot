import { safeHttpsUrl } from "@/lib/canvas/map";
import { capCourseInfo, type CourseInfo, type RawInfo } from "./schemas";
import { canvasHostsFrom, curateLinks, formatTimeRange } from "./view";

type Person = CourseInfo["people"][number];
type Role = Person["role"];

/** Map a Canvas role label (custom roles like "GSI", "IA", "ULA" are common) onto our small set of roles. */
export function roleFromCanvas(label: string | null | undefined, base?: string): Role {
  const l = (label ?? "").toLowerCase();
  if (/\b(gsi|gti|graduate|grad ta|teaching assistant|\bta\b)/.test(l) && !/instructional assistant/.test(l)) return "ta";
  if (/instructional assistant|\bia\b|\bula\b|undergrad|learning assistant|\bla\b|peer|tutor|course assistant/.test(l)) return "ia";
  if (/grader/.test(l)) return "grader";
  if (/instructor|professor|lecturer|teacher|faculty/.test(l)) return "instructor";
  if (/coordinator|designer|admin/.test(l)) return "coordinator";
  if (base === "teacher") return "instructor";
  if (base === "ta") return "ta";
  if (base === "designer") return "coordinator";
  return "other";
}

const normName = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

/**
 * Merge Canvas's own staff list (authoritative for names, roles and emails) with people the AI found in page text
 * (who add office hours, locations and staff Canvas doesn't list). Matched by email, else by name (order-insensitive).
 */
export function mergePeople(canvas: RawInfo["people"], found: Person[]): Person[] {
  const out: Person[] = canvas.map((c) => ({
    // Canvas's built-in role names ("TeacherEnrollment", "TaEnrollment") are internal; only custom ones (GSI, IA, Head GSI…) are worth showing.
    name: c.name, role: roleFromCanvas(c.role, c.base_role), title: c.role && !/^(teacher|ta|designer|student|observer)(enrollment)?$/i.test(c.role.trim()) ? c.role.replace(/Enrollment$/i, "").trim() : null,
    email: c.email && EMAIL.test(c.email) ? c.email : null, office_hours: null, location: null, notes: c.bio, source: "canvas",
  }));
  for (const f of found) {
    const email = f.email && EMAIL.test(f.email) ? f.email.toLowerCase() : null;
    const hit = out.find((o) => (email && o.email?.toLowerCase() === email) || normName(o.name) === normName(f.name));
    if (hit) {
      hit.office_hours ??= f.office_hours; hit.location ??= f.location; hit.email ??= email; hit.title ??= f.title; hit.notes ??= f.notes;
      if (hit.role === "other" && f.role !== "other") hit.role = f.role;
    } else out.push({ ...f, email, source: "page" });
  }
  const order: Role[] = ["instructor", "coordinator", "ta", "ia", "grader", "other"];
  return out.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
}

export function linkKind(label: string, url: string): CourseInfo["links"][number]["kind"] {
  const t = `${label} ${url}`.toLowerCase();
  if (/piazza|edstem|ed discussion|discourse|campuswire|forum|q&a/.test(t)) return "forum";
  if (/gradescope/.test(t)) return "gradescope";
  if (/zoom|meet\.google|teams\.microsoft|webex/.test(t)) return "meeting";
  if (/autograder|lobster/.test(t)) return "autograder";
  if (/calendar/.test(t)) return "calendar";
  if (/textbook|zybooks|vitalsource|pearson|mcgraw|cengage/.test(t)) return "textbook";
  if (/notes|slides|lecture/.test(t)) return "notes";
  return "other";
}

/**
 * Office-hours blocks often arrive as meetings ("Sam Lee office hours, Thu 4-5pm"). Attach each to the person it names so it
 * shows on their card. Matching: full name, or a first/last name that identifies exactly one staff member. Never overwrites.
 */
export function attachOfficeHours(people: CourseInfo["people"], meetings: CourseInfo["meetings"]): CourseInfo["people"] {
  const out = people.map((p) => ({ ...p }));
  for (const m of meetings) {
    if (m.kind !== "office_hours") continue;
    const hay = ` ${[m.person, m.title, m.notes].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z\s]/g, " ")} `;
    const full = out.filter((p) => hay.includes(` ${p.name.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `));
    const partial = full.length ? full : out.filter((p) => p.name.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 3).some((w) => hay.includes(` ${w.replace(/[^a-z]/g, "")} `)));
    if (partial.length !== 1) continue;                                   // ambiguous or unnamed: leave it in the meetings list only
    const target = partial[0];
    const when = [m.days, formatTimeRange(m.start_time, m.end_time)].filter(Boolean).join(" ");
    const text = [when, m.location].filter(Boolean).join(" · ");
    if (!target.office_hours && text) target.office_hours = text.slice(0, 300);
    if (!target.location && m.location) target.location = m.location;
  }
  return out;
}

/** Combine the AI's reading with facts that came straight from Canvas (staff list, external-tool tabs). */
export function finalizeCourseInfo(ai: CourseInfo, raw: RawInfo): CourseInfo {
  const out: CourseInfo = capCourseInfo(structuredClone(ai));
  out.people = attachOfficeHours(mergePeople(raw.people, ai.people), out.meetings);

  const seen = new Set<string>();
  const links: CourseInfo["links"] = [];
  const add = (label: string, url: string | null | undefined, kind?: CourseInfo["links"][number]["kind"]) => {
    const u = safeHttpsUrl(url); if (!u) return;
    const key = u.replace(/\/$/, "").toLowerCase(); if (seen.has(key)) return; seen.add(key);
    links.push({ label: label.slice(0, 100), url: u, kind: kind ?? linkKind(label, u) });
  };
  for (const l of ai.links) add(l.label, l.url, l.kind);
  for (const t of raw.tabs) if (t.external && t.url) add(t.label, t.url);   // e.g. Gradescope / Piazza tabs
  const canvasHosts = canvasHostsFrom(raw.tabs);
  out.links = curateLinks(links, 99, canvasHosts).all.slice(0, 40);

  out.contacts = ai.contacts.filter((c) => (c.type === "email" ? EMAIL.test(c.value) : c.type === "phone" ? true : !!safeHttpsUrl(c.value))).map((c) => ({ ...c, value: c.value.trim() }));
  return out;
}

/** Only fill what the course doesn't have yet. Never overwrites something the student entered. */
export function courseFieldFills(course: { professor: string | null; professor_email: string | null; office_hours: string | null; classroom: string | null; description: string | null }, info: CourseInfo): Record<string, string> {
  const patch: Record<string, string> = {};
  const instructors = info.people.filter((p) => p.role === "instructor");
  if (!course.professor && instructors.length) patch.professor = instructors.slice(0, 3).map((p) => p.name).join(", ").slice(0, 120);
  const lead = instructors[0];
  if (!course.professor_email && lead?.email) patch.professor_email = lead.email;
  if (!course.office_hours && lead?.office_hours) patch.office_hours = lead.office_hours.slice(0, 300);
  const lecture = info.meetings.find((m) => m.kind === "lecture" && m.location);
  if (!course.classroom && lecture?.location) patch.classroom = lecture.location.slice(0, 120);
  if (!course.description && info.summary) patch.description = info.summary.slice(0, 1000);
  return patch;
}
