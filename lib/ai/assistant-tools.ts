/**
 * Deterministic tools the assistant can call. They read a snapshot of the student's own data and use the
 * same grade engine as the rest of the app, so Gemini only phrases results; it never computes grades or dates.
 */
import { applyScenario, computeGrade, gradeRange, letterForPercent, requiredScore } from "@/lib/grades/calculations";
import { buildItems, buildScheme } from "@/lib/grades/adapt";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";
import { estimateMinutes, isOpen, rankAssignments } from "@/lib/planner/priority";
import { courseInfoSchema, type CourseInfo } from "@/lib/course-info/schemas";
import { describeMeeting, ROLE_LABEL } from "@/lib/course-info/view";
import { describeWeek, weeklyWorkload } from "@/lib/planner/workload";
import { displayStatus, STATUS_LABEL } from "@/lib/utils/dates";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

export interface AssistantSnapshot {
  now: Date; timeZone: string; presetKey: string; focusCourseId: string | null;
  courses: Course[]; categories: GradingCategoryRow[]; assignments: Assignment[]; grades: AssignmentGrade[];
  syllabi: { course_id: string; file_name: string; status: string; extracted: unknown }[];
  history: { assignment_id: string; field: string; old_value: string | null; new_value: string | null; created_at: string }[];
  announcements: { course_id: string; title: string; posted_at: string | null }[];
  lastSync: { status: string; finished_at: string | null } | null;
  weeklyStudyHours: number;
  /** Structured course facts read from Canvas (staff, class times, links, policies) + the module outline. */
  courseInfo?: { course_id: string; info: unknown; modules?: { name: string; items: string[] }[] }[];
}

export interface Citation { type: "course" | "assignment" | "syllabus" | "grades" | "planner"; label: string; href: string }
export interface ToolOutput { result: unknown; citations: Citation[] }

const DAY = 86_400_000;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function fmt(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)); }
  catch { return iso; }
}

type Resolved = { course: Course } | { error: string };
export function resolveCourse(s: AssistantSnapshot, q?: string | null): Resolved {
  if (!q || !q.trim()) {
    const focus = s.courses.find((c) => c.id === s.focusCourseId);
    if (focus) return { course: focus };
    if (s.courses.length === 1) return { course: s.courses[0] };
    return { error: `Which course? Options: ${s.courses.map((c) => c.code ?? c.name).join(", ") || "none yet"}.` };
  }
  const n = norm(q);
  const exact = s.courses.filter((c) => norm(c.code) === n || norm(c.name) === n || c.id === q);
  const hits = exact.length ? exact : s.courses.filter((c) => (n && (norm(c.code).includes(n) || n.includes(norm(c.code)) && norm(c.code).length > 2)) || norm(c.name).includes(n));
  if (hits.length === 1) return { course: hits[0] };
  if (hits.length === 0) return { error: `No course matches "${q}". Courses: ${s.courses.map((c) => c.code ?? c.name).join(", ") || "none yet"}.` };
  return { error: `"${q}" matches several courses: ${hits.map((c) => c.code ?? c.name).join(", ")}. Ask which one.` };
}

const courseCite = (c: Course, tab?: string): Citation => ({ type: "course", label: c.code ?? c.name, href: `/courses/${c.id}${tab ? `?tab=${tab}` : ""}` });
const asgCite = (a: Assignment): Citation => ({ type: "assignment", label: a.title, href: `/courses/${a.course_id}?tab=assignments` });

function courseGradeData(s: AssistantSnapshot, c: Course) {
  const cats = s.categories.filter((k) => k.course_id === c.id);
  const mine = s.assignments.filter((a) => a.course_id === c.id);
  const scheme = buildScheme(c, cats, s.presetKey);
  const items = buildItems(mine, s.grades);
  return { scheme, items, mine, cats };
}

function assignmentRow(s: AssistantSnapshot, a: Assignment) {
  const c = s.courses.find((x) => x.id === a.course_id);
  const st = displayStatus(a, s.now);
  const e = estimateMinutes(a);
  return {
    id: a.id, title: a.title, course: c?.code ?? c?.name, type: a.type, status: STATUS_LABEL[st], due: fmt(a.due_at, s.timeZone), due_iso: a.due_at,
    points: a.points_possible, priority: a.priority, estimated_minutes: e.minutes, estimate_is_default: e.isDefault, source: a.source,
  };
}

export const TOOL_DECLARATIONS = [
  { name: "list_courses", description: "List the student's courses with current grade (graded work only).", parametersJsonSchema: { type: "object", properties: {} } },
  {
    name: "list_assignments",
    description: "List assignments/exams with due dates. Use for 'what's due', 'when is my midterm', deadlines. Dates are returned already formatted in the student's timezone.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        course: { type: "string", description: "Course code or name, e.g. 'IOE 310'. Omit for all courses." },
        status: { type: "string", enum: ["open", "overdue", "completed", "all"], description: "Default open." },
        type: { type: "string", enum: ["homework", "quiz", "exam", "project", "paper", "lab", "reading", "presentation", "study", "other"] },
        days_ahead: { type: "number", description: "Only items due within this many days from now (e.g. 7 for 'this week')." },
        title_contains: { type: "string", description: "Filter by words in the title, e.g. 'midterm'." },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_course_grade",
    description: "The student's current grade in a course using the app's grade engine: percent, letter, category weights and averages, and the range still possible. Use for 'what's my grade', 'what percent is homework worth'.",
    parametersJsonSchema: { type: "object", properties: { course: { type: "string" } } },
  },
  {
    name: "grade_needed",
    description: "What score is needed on remaining work to reach a target grade (letter like 'A' or percent like 90). Uses the grade engine. When the student asks about one specific exam or assignment (e.g. 'the final'), ALWAYS pass `assignment` so the answer is for that item.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        course: { type: "string" }, target: { type: "string", description: "Letter ('A', 'B+') or percent ('90')." },
        assignment: { type: "string", description: "Title of a single ungraded assignment (e.g. 'Final Exam'). Omit to spread across all remaining work." },
        assume_other_percent: { type: "number", description: "If targeting one assignment, the percent assumed on other remaining work." },
      },
      required: ["target"],
    },
  },
  {
    name: "what_if",
    description: "Hypothetical grade if specific assignments get specific percentages. Not saved.",
    parametersJsonSchema: {
      type: "object",
      properties: { course: { type: "string" }, scores: { type: "array", items: { type: "object", properties: { assignment: { type: "string" }, percent: { type: "number" } }, required: ["assignment", "percent"] } } },
      required: ["scores"],
    },
  },
  {
    name: "get_syllabus",
    description: "Information extracted from a course syllabus: details, grading, policies (late, drop, attendance, extra credit, exams), important dates.",
    parametersJsonSchema: { type: "object", properties: { course: { type: "string" }, section: { type: "string", enum: ["overview", "grading", "policies", "dates", "all"] } } },
  },
  {
    name: "get_course_info",
    description: "Facts about a course from its Canvas pages: instructors, TAs/GSIs/IAs with emails and office hours, class meeting times and rooms, contact points (email, Ed/Piazza forum), tool links (Gradescope, Zoom), textbooks, key facts, policies, and the module outline. Use for 'who is my GSI', 'when/where is lecture', 'office hours', 'how do I contact…', 'what's the Piazza/Ed link', 'what platform do we use for…'.",
    parametersJsonSchema: { type: "object", properties: { course: { type: "string" }, topic: { type: "string", enum: ["people", "times", "contacts", "links", "policies", "outline", "all"] } } },
  },
  {
    name: "workload",
    description: "How busy upcoming weeks are: exams and assignments per week and estimated hours. Use for 'how busy is my week'.",
    parametersJsonSchema: { type: "object", properties: { weeks: { type: "number", description: "1-6, default 2" } } },
  },
  {
    name: "prioritize",
    description: "Rank open work by an explainable priority score (urgency, size, exam/weight, student's own priority). Use for 'what should I prioritize' or 'which class'.",
    parametersJsonSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "recent_changes",
    description: "Recently added Canvas assignments, changed deadlines and announcements, and when Canvas last synced.",
    parametersJsonSchema: { type: "object", properties: { days: { type: "number", description: "Default 14" } } },
  },
] as const;

export function executeTool(name: string, args: Record<string, unknown>, s: AssistantSnapshot): ToolOutput {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  const num = (k: string) => (typeof args[k] === "number" && Number.isFinite(args[k]) ? (args[k] as number) : undefined);

  switch (name) {
    case "list_courses": {
      return {
        result: s.courses.map((c) => { const d = courseGradeData(s, c); const g = computeGrade(d.scheme, d.items); return { code: c.code, name: c.name, professor: c.professor, credits: c.credits, current_percent: g.percent === null ? null : round(g.percent), current_letter: g.letter, graded_items: g.gradedCount }; }),
        citations: s.courses.map((c) => courseCite(c)),
      };
    }
    case "list_assignments": {
      let list = s.assignments;
      const cq = str("course");
      if (cq) { const r = resolveCourse(s, cq); if ("error" in r) return { result: { error: r.error }, citations: [] }; list = list.filter((a) => a.course_id === r.course.id); }
      else if (s.focusCourseId) list = list.filter((a) => a.course_id === s.focusCourseId);
      const status = str("status") ?? "open";
      list = list.filter((a) => status === "all" || (status === "open" ? isOpen(a) : status === "completed" ? !isOpen(a) : displayStatus(a, s.now) === "overdue"));
      if (str("type")) list = list.filter((a) => a.type === str("type"));
      const tc = str("title_contains")?.toLowerCase();
      if (tc) list = list.filter((a) => a.title.toLowerCase().includes(tc));
      const ahead = num("days_ahead");
      if (ahead !== undefined) list = list.filter((a) => a.due_at && +new Date(a.due_at) >= +s.now - (status === "open" ? 0 : Infinity) && +new Date(a.due_at) <= +s.now + ahead * DAY);
      list = [...list].sort((a, b) => +new Date(a.due_at ?? 8.64e15) - +new Date(b.due_at ?? 8.64e15)).slice(0, Math.min(num("limit") ?? 25, 50));
      return { result: { count: list.length, now: fmt(s.now.toISOString(), s.timeZone), assignments: list.map((a) => assignmentRow(s, a)) }, citations: list.slice(0, 6).map(asgCite) };
    }
    case "get_course_grade": {
      const r = resolveCourse(s, str("course")); if ("error" in r) return { result: { error: r.error }, citations: [] };
      const d = courseGradeData(s, r.course);
      const g = computeGrade(d.scheme, d.items);
      const range = gradeRange(d.scheme, d.items);
      return {
        result: {
          course: r.course.code ?? r.course.name, kind: "current (graded work only; ungraded work is not counted as zero)", method: d.scheme.mode,
          percent: g.percent === null ? null : round(g.percent), letter: g.letter, graded_items: g.gradedCount, curve: d.scheme.curve,
          categories: g.categories.map((c) => ({ name: c.name, weight_percent: d.scheme.mode === "weighted" ? c.weight : null, average_percent: c.percent === null ? null : round(c.percent), graded: c.gradedCount, total: c.totalCount, dropped: c.droppedIds.length })),
          possible_range: g.percent === null ? null : { if_remaining_zero: round(range.min.percent ?? 0), if_remaining_perfect: round(range.max.percent ?? 0) },
          warnings: g.warnings,
        },
        citations: [courseCite(r.course, "grades")],
      };
    }
    case "grade_needed": {
      const r = resolveCourse(s, str("course")); if ("error" in r) return { result: { error: r.error }, citations: [] };
      const d = courseGradeData(s, r.course);
      const t = str("target") ?? "";
      const letter = d.scheme.scale.find((x) => x.letter.toLowerCase() === t.trim().toLowerCase());
      const pct = letter ? letter.min : Number(t.replace("%", ""));
      if (!Number.isFinite(pct)) return { result: { error: `Couldn't understand target "${t}". Use a letter like A or a percent like 90.` }, citations: [] };
      let itemIds: string[] | undefined;
      if (str("assignment")) {
        const q = str("assignment")!.toLowerCase();
        const hit = d.items.find((i) => i.earned === null && i.name.toLowerCase().includes(q));
        if (!hit) return { result: { error: `No ungraded assignment matching "${str("assignment")}" in ${r.course.code ?? r.course.name}.` }, citations: [courseCite(r.course, "grades")] };
        itemIds = [hit.id];
      }
      // Targeting one assignment: unless told otherwise, assume other remaining work lands at the current grade (stated in assumptions).
      const cur = computeGrade(d.scheme, d.items).percent;
      const othersPercent = num("assume_other_percent") ?? (itemIds && cur !== null ? Math.round(cur * 10) / 10 : null);
      const res = requiredScore(d.scheme, d.items, pct, { itemIds, othersPercent });
      return {
        result: {
          course: r.course.code ?? r.course.name, target: letter ? `${letter.letter} (${letter.min}%)` : `${pct}%`,
          required_percent: res.requiredPercent === null ? null : round(res.requiredPercent), already_secured: res.alreadySecured, achievable: res.achievable,
          per_item: res.requiredPointsPerItem.slice(0, 6).map((p) => ({ name: p.name, points_needed: round(p.points), out_of: p.possible })), assumptions: res.assumptions, note: res.reason,
        },
        citations: [courseCite(r.course, "grades")],
      };
    }
    case "what_if": {
      const r = resolveCourse(s, str("course")); if ("error" in r) return { result: { error: r.error }, citations: [] };
      const d = courseGradeData(s, r.course);
      const scores: Record<string, number> = {}; const applied: string[] = []; const unmatched: string[] = [];
      const list = Array.isArray(args.scores) ? (args.scores as { assignment?: string; percent?: number }[]) : [];
      for (const sc of list) {
        const q = (sc.assignment ?? "").toLowerCase();
        const hit = d.items.find((i) => i.name.toLowerCase().includes(q));
        if (!hit || typeof sc.percent !== "number") { unmatched.push(sc.assignment ?? "?"); continue; }
        scores[hit.id] = (hit.possible * sc.percent) / 100; applied.push(`${hit.name} = ${sc.percent}%`);
      }
      const before = computeGrade(d.scheme, d.items);
      const after = computeGrade(d.scheme, applyScenario(d.items, scores), "hypothetical");
      return { result: { course: r.course.code ?? r.course.name, kind: "hypothetical (not saved)", applied, unmatched, current_percent: before.percent === null ? null : round(before.percent), hypothetical_percent: after.percent === null ? null : round(after.percent), hypothetical_letter: after.letter }, citations: [courseCite(r.course, "grades")] };
    }
    case "get_syllabus": {
      const r = resolveCourse(s, str("course")); if ("error" in r) return { result: { error: r.error }, citations: [] };
      const syl = s.syllabi.find((x) => x.course_id === r.course.id);
      if (!syl?.extracted) return { result: { error: `No syllabus has been uploaded for ${r.course.code ?? r.course.name}.` }, citations: [courseCite(r.course, "syllabus")] };
      const p = syllabusExtractionSchema.safeParse(syl.extracted);
      if (!p.success) return { result: { error: "The saved syllabus data couldn't be read." }, citations: [] };
      const e = p.data; const section = str("section") ?? "all";
      const out: Record<string, unknown> = { file: syl.file_name, note: "Only call a value 'inferred' if its field is listed in course inferred_fields or the item has basis 'inferred'; otherwise it was stated in the syllabus." };
      if (section === "overview" || section === "all") out.course = e.course;
      if (section === "grading" || section === "all") out.grading = e.grading;
      if (section === "policies" || section === "all") out.policies = e.policies;
      if (section === "dates" || section === "all") out.important_dates = e.important_dates;
      if (section === "all") out.assignments = e.assignments.slice(0, 25);
      return { result: out, citations: [{ type: "syllabus", label: `${r.course.code ?? r.course.name} syllabus`, href: `/courses/${r.course.id}?tab=syllabus` }] };
    }
    case "get_course_info": {
      const r = resolveCourse(s, str("course")); if ("error" in r) return { result: { error: r.error }, citations: [] };
      const row = s.courseInfo?.find((x) => x.course_id === r.course.id);
      const parsed = row?.info ? courseInfoSchema.safeParse(row.info) : null;
      const info: CourseInfo | null = parsed?.success ? parsed.data : null;
      const topic = str("topic") ?? "all";
      const base: Record<string, unknown> = { course: r.course.code ?? r.course.name, source: "Canvas pages (read automatically; may be incomplete)" };
      // Details the student or their syllabus already entered on the course itself count too.
      const own = { instructor_on_course: r.course.professor, email_on_course: r.course.professor_email, office_hours_on_course: r.course.office_hours, room_on_course: r.course.classroom };
      if (!info && !row?.modules?.length) return { result: { ...base, ...own, note: "No course info has been read from Canvas for this course yet. Syncing Canvas (Integrations) reads staff, class times and links." }, citations: [courseCite(r.course, "info")] };
      if (info) {
        if (topic === "people" || topic === "all") base.people = info.people.map((p) => ({ name: p.name, role: ROLE_LABEL[p.role], title: p.title, email: p.email, office_hours: p.office_hours, location: p.location }));
        if (topic === "times" || topic === "all") base.meetings = info.meetings.map((m) => ({ kind: m.kind, title: m.title, when: describeMeeting({ ...m, location: null }), location: m.location, person: m.person, section: m.section, notes: m.notes }));
        if (topic === "contacts" || topic === "all") base.contacts = info.contacts;
        if (topic === "links" || topic === "all") base.links = info.links.map((l) => ({ label: l.label, url: l.url, kind: l.kind }));
        if (topic === "policies" || topic === "all") { base.policies = info.policies; base.grading_summary = info.grading_summary; }
        if (topic === "all") { base.summary = info.summary; base.key_info = info.key_info; base.textbooks = info.textbooks; }
      }
      if ((topic === "outline" || topic === "all") && row?.modules?.length) base.outline = row.modules.slice(0, 30).map((m) => ({ module: m.name, items: m.items.slice(0, 6) }));
      Object.assign(base, own);
      return { result: base, citations: [courseCite(r.course, "info")] };
    }
    case "workload": {
      const weeks = Math.max(1, Math.min(6, Math.round(num("weeks") ?? 2)));
      const rows = weeklyWorkload(s.assignments, s.now, weeks, s.timeZone, s.weeklyStudyHours * 60);
      return {
        result: { weeks: rows.map((w) => ({ week: w.label, exams: w.exams, other_assignments: w.others, estimated_hours: round(w.minutes / 60, 1), busy: w.busy, summary: describeWeek(w) })), weekly_study_hours_available: s.weeklyStudyHours, note: "Hours use your estimates where set, otherwise default estimates by type." },
        citations: [{ type: "planner", label: "Study Planner", href: "/planner" }],
      };
    }
    case "prioritize": {
      const ranked = rankAssignments(s.assignments, s.now, (a) => { const w = s.categories.find((c) => c.id === a.category_id)?.weight; return w ? Number(w) : null; }).slice(0, Math.min(num("limit") ?? 6, 12));
      const byCourse = new Map<string, number>();
      for (const r of ranked) byCourse.set(r.assignment.course_id, (byCourse.get(r.assignment.course_id) ?? 0) + r.score);
      const topCourse = [...byCourse.entries()].sort((a, b) => b[1] - a[1])[0];
      const c = topCourse ? s.courses.find((x) => x.id === topCourse[0]) : undefined;
      return {
        result: { top_course_by_total_priority: c ? c.code ?? c.name : null, ranked: ranked.map((r) => ({ ...assignmentRow(s, r.assignment), score: round(r.score, 0), why: r.reasons })) },
        citations: [...ranked.slice(0, 4).map((r) => asgCite(r.assignment)), { type: "planner" as const, label: "Study Planner", href: "/planner" }],
      };
    }
    case "recent_changes": {
      const days = num("days") ?? 14; const since = +s.now - days * DAY;
      const added = s.assignments.filter((a) => a.source === "canvas" && +new Date(a.created_at) >= since);
      const changes = s.history.filter((h) => +new Date(h.created_at) >= since);
      const title = (id: string) => s.assignments.find((a) => a.id === id)?.title ?? "an assignment";
      return {
        result: {
          last_canvas_sync: s.lastSync ? { status: s.lastSync.status, at: fmt(s.lastSync.finished_at, s.timeZone) } : "Canvas has never been synced",
          new_canvas_assignments: added.slice(0, 20).map((a) => assignmentRow(s, a)),
          changes: changes.slice(0, 20).map((h) => ({ assignment: title(h.assignment_id), field: h.field, from: h.field === "due_at" ? fmt(h.old_value, s.timeZone) : h.old_value, to: h.field === "due_at" ? fmt(h.new_value, s.timeZone) : h.new_value, when: fmt(h.created_at, s.timeZone) })),
          announcements: s.announcements.filter((a) => a.posted_at && +new Date(a.posted_at) >= since).slice(0, 10).map((a) => ({ course: s.courses.find((c) => c.id === a.course_id)?.code, title: a.title, posted: fmt(a.posted_at, s.timeZone) })),
        },
        citations: [{ type: "course", label: "Integrations", href: "/integrations" }, ...added.slice(0, 4).map(asgCite)],
      };
    }
    default:
      return { result: { error: `Unknown tool ${name}` }, citations: [] };
  }
}

function round(n: number, places = 2) { const f = 10 ** places; return Math.round(n * f) / f; }

/** Used by tests and the live script. */
export { letterForPercent };
