import { describe, expect, it } from "vitest";
import { collectCourseInfo, hasAnyInfo, htmlToText, LIMITS } from "../../extension/lib/course-info.js";
import { courseFieldFills, finalizeCourseInfo, linkKind, mergePeople, roleFromCanvas } from "./merge";
import { courseInfoSchema, EMPTY_COURSE_INFO, rawCourseInfoSchema, rawHash } from "./schemas";
import { classesOnWeekday, formatTimeRange, groupPeople, parseDays } from "./view";

describe("htmlToText (no DOM)", () => {
  it("keeps headings, lists, table rows and links; drops scripts/styles/comments; decodes entities", () => {
    const t = htmlToText(`<style>.x{}</style><h2>Office&nbsp;Hours</h2><p>Mon &amp; Wed<br>3&ndash;4pm</p><ul><li>Room 1571</li><li><a href="/courses/1/pages/staff">Staff</a></li></ul><table><tr><th>Day</th><th>Time</th></tr><tr><td>Fri</td><td>10am</td></tr></table><!-- hide --><script>evil()</script>`, "https://canvas.umich.edu");
    expect(t).toContain("## Office Hours");
    expect(t).toContain("Mon & Wed");
    expect(t).toContain("3–4pm");
    expect(t).toContain("- Room 1571");
    expect(t).toContain("[Staff](https://canvas.umich.edu/courses/1/pages/staff)");
    expect(t).toContain("Day | Time");
    expect(t).toContain("Fri | 10am");
    expect(t).not.toMatch(/evil|hide|\.x\{/);
  });
  it("blocks non-http links and tolerates garbage", () => {
    expect(htmlToText(`<a href="javascript:alert(1)">click</a>`, "https://c.edu")).toBe("click");
    expect(htmlToText(null, "https://c.edu")).toBe("");
    expect(htmlToText("<p>&#x1F600; &#65; &bogus;</p>", "https://c.edu")).toContain("😀 A &bogus;");
  });
});

const BASE = "https://canvas.example.edu";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSession(handlers: Record<string, unknown>, calls: string[] = []): any {
  const find = (path: string) => { calls.push(path); const k = Object.keys(handlers).find((h) => path.startsWith(h)); if (!k) throw new Error("404"); const v = handlers[k]; if (v instanceof Error) throw v; return v; };
  return { get: async (path: string) => find(path), paginate: async (path: string) => find(path) as unknown[] };
}

describe("collectCourseInfo", () => {
  const handlers = {
    "/api/v1/courses/7/front_page": { title: "Welcome", html_url: `${BASE}/courses/7`, body: `<h1>EECS 280</h1><p>Lecture MW 10:30–12:00 in 1571 GGBL. ${"x ".repeat(30)}</p>` },
    "/api/v1/courses/7/pages/": { title: "Staff", html_url: `${BASE}/courses/7/pages/staff`, body: `<p>Instructor: Dr. Rivera, office hours Tue 2–3pm. ${"y ".repeat(30)}</p>` },
    "/api/v1/courses/7/pages": [{ url: "staff", title: "Staff & Contact" }, { url: "memes", title: "Fun memes" }],
    "/api/v1/courses/7/users": [
      { name: "Dr. Rivera", email: "rivera@example.edu", enrollments: [{ type: "TeacherEnrollment", role: "TeacherEnrollment" }] },
      { name: "Sam GSI", email: "sam@example.edu", enrollments: [{ type: "TaEnrollment", role: "GSI" }] },
      { name: "A Student", email: "stu@example.edu", enrollments: [{ type: "StudentEnrollment", role: "StudentEnrollment" }] },
    ],
    "/api/v1/courses/7/sections": [{ name: "Section 001" }],
    "/api/v1/calendar_events": [{ title: "Office hours", start_at: "2026-11-10T19:00:00Z", location_name: "BBB 1690" }],
    "/api/v1/courses/7/tabs": [{ label: "Gradescope", type: "external", html_url: `${BASE}/courses/7/external_tools/1` }, { label: "Grades", type: "internal", html_url: "/courses/7/grades" }, { label: "Hidden", hidden: true }],
    "/api/v1/courses/7/modules": [{ name: "Week 1", items: [{ title: "Intro" }, { title: "Lab 1" }] }],
    "/api/v1/courses/7": { syllabus_body: `<h2>Syllabus</h2><p>${"Grading: projects 40%. ".repeat(5)}</p>` },
  };
  it("reads every part, converts HTML to text, and keeps only relevant pages", async () => {
    const raw = await collectCourseInfo(fakeSession(handlers), 7, { baseUrl: BASE });
    expect(raw.syllabus_text).toContain("Grading: projects 40%");
    expect(raw.pages.map((p: { title: string }) => p.title)).toEqual(["Welcome", "Staff"]);   // "Fun memes" skipped
    expect(raw.sections).toEqual([{ name: "Section 001", start: null, end: null }]);
    expect(raw.events[0]).toMatchObject({ title: "Office hours", location: "BBB 1690" });
    expect(raw.tabs.map((t: { label: string }) => t.label)).toEqual(["Gradescope", "Grades"]);   // hidden tab skipped
    expect(raw.modules).toEqual([{ name: "Week 1", items: ["Intro", "Lab 1"] }]);
    expect(hasAnyInfo(raw)).toBe(true);
    expect(rawCourseInfoSchema.safeParse(raw).success).toBe(true);
  });
  it("PRIVACY: asks Canvas only for teacher/TA/designer enrollments and never keeps a student", async () => {
    const calls: string[] = [];
    let params: unknown;
    const s = { get: async (p: string) => fakeSession(handlers, calls).get(p), paginate: async (p: string, pr?: Record<string, unknown>) => { if (p.endsWith("/users")) params = pr; return fakeSession(handlers, calls).paginate(p); } } as never;
    const raw = await collectCourseInfo(s, 7, { baseUrl: BASE });
    expect((params as Record<string, string[]>)["enrollment_type[]"]).toEqual(["teacher", "ta", "designer"]);
    expect(raw.people.map((p: { name: string }) => p.name)).toEqual(["Dr. Rivera", "Sam GSI"]);
    expect(JSON.stringify(raw)).not.toMatch(/A Student|stu@example/);
  });
  it("is best-effort: a failing endpoint doesn't stop the rest", async () => {
    const raw = await collectCourseInfo(fakeSession({ ...handlers, "/api/v1/courses/7/users": new Error("403"), "/api/v1/calendar_events": new Error("500") }), 7, { baseUrl: BASE });
    expect(raw.people).toEqual([]);
    expect(raw.events).toEqual([]);
    expect(raw.pages.length).toBe(2);
  });
  it("caps total text", async () => {
    const big = { ...handlers, "/api/v1/courses/7": { syllabus_body: `<p>${"word ".repeat(40000)}</p>` } };
    const raw = await collectCourseInfo(fakeSession(big), 7, { baseUrl: BASE });
    const total = (raw.syllabus_text?.length ?? 0) + raw.pages.reduce((n: number, p: { text: string }) => n + p.text.length, 0);
    expect(total).toBeLessThanOrEqual(LIMITS.totalChars);
  });
  it("returns nothing useful for an empty course", async () => {
    expect(hasAnyInfo(await collectCourseInfo(fakeSession({}), 7, { baseUrl: BASE }))).toBe(false);
  });
});

describe("roles and merging", () => {
  it("maps Canvas role labels (including custom ones)", () => {
    expect(roleFromCanvas("GSI", "ta")).toBe("ta");
    expect(roleFromCanvas("Graduate Student Instructor", "ta")).toBe("ta");
    expect(roleFromCanvas("Instructional Assistant (IA)", "ta")).toBe("ia");
    expect(roleFromCanvas("ULA", "ta")).toBe("ia");
    expect(roleFromCanvas("TaEnrollment", "ta")).toBe("ta");
    expect(roleFromCanvas("TeacherEnrollment", "teacher")).toBe("instructor");
    expect(roleFromCanvas("Grader", "ta")).toBe("grader");
    expect(roleFromCanvas("", "designer")).toBe("coordinator");
  });
  const canvas = [{ name: "Dr. Rivera", role: "TeacherEnrollment", base_role: "teacher" as const, email: "rivera@example.edu", bio: null }, { name: "Sam Lee", role: "GSI", base_role: "ta" as const, email: null, bio: null }];
  const found = [
    { name: "Rivera, Dr.", role: "instructor" as const, title: null, email: null, office_hours: "Tue 2–3pm", location: "BBB 3601", notes: null, source: "page" as const },
    { name: "Sam Lee", role: "ta" as const, title: null, email: "sam@example.edu", office_hours: "Wed 4pm", location: null, notes: null, source: "page" as const },
    { name: "Pat Kim", role: "ia" as const, title: null, email: "pat@example.edu", office_hours: null, location: null, notes: null, source: "page" as const },
  ];
  it("keeps Canvas authoritative, enriches from pages, and adds page-only staff", () => {
    const m = mergePeople(canvas, found);
    expect(m.map((p) => p.name)).toEqual(["Dr. Rivera", "Sam Lee", "Pat Kim"]);
    expect(m[0]).toMatchObject({ role: "instructor", email: "rivera@example.edu", office_hours: "Tue 2–3pm", location: "BBB 3601", source: "canvas" });
    expect(m[1]).toMatchObject({ role: "ta", email: "sam@example.edu", office_hours: "Wed 4pm", source: "canvas", title: "GSI" });
    expect(m[2]).toMatchObject({ role: "ia", source: "page" });
  });
  it("hides Canvas's internal role names but keeps custom titles", () => {
    const m = mergePeople([{ name: "A B", role: "TeacherEnrollment", base_role: "teacher", email: null, bio: null }, { name: "C D", role: "TaEnrollment", base_role: "ta", email: null, bio: null }, { name: "E F", role: "Head GSI", base_role: "ta", email: null, bio: null }], []);
    expect(m.map((p) => p.title)).toEqual([null, null, "Head GSI"]);
    expect(m.map((p) => p.role)).toEqual(["instructor", "ta", "ta"]);
  });
  it("rejects malformed emails", () => {
    expect(mergePeople([{ name: "X Y", role: "", email: "not an email", bio: null }], [])[0].email).toBeNull();
  });
  it("finalize adds external-tool tabs as links, dedupes, and drops unsafe links and contacts", () => {
    const ai = courseInfoSchema.parse({
      links: [{ label: "Ed", url: "https://edstem.org/us/courses/1", kind: "forum" }, { label: "Evil", url: "javascript:alert(1)", kind: "other" }],
      contacts: [{ label: "Email", type: "email", value: "course@example.edu" }, { label: "Bad", type: "email", value: "nope" }, { label: "Form", type: "form", value: "http://insecure.example" }],
    });
    const out = finalizeCourseInfo(ai, rawCourseInfoSchema.parse({ tabs: [{ label: "Gradescope", url: "https://www.gradescope.com/courses/9", external: true }, { label: "Ed", url: "https://edstem.org/us/courses/1/", external: true }, { label: "Grades", url: "https://c.edu/grades", external: false }], people: canvas }));
    expect(out.links.map((l) => `${l.label}:${l.kind}`)).toEqual(["Ed:forum", "Gradescope:gradescope"]);
    expect(out.contacts.map((c) => c.label)).toEqual(["Email"]);
    expect(out.people).toHaveLength(2);
  });
  it("classifies link kinds", () => { expect(linkKind("Zoom", "https://umich.zoom.us/j/1")).toBe("meeting"); expect(linkKind("Q&A", "https://piazza.com/x")).toBe("forum"); expect(linkKind("zyBooks", "https://learn.zybooks.com")).toBe("textbook"); });
  it("only fills course fields that are empty", () => {
    const info = courseInfoSchema.parse({ summary: "About C++.", people: [{ name: "Dr. R", role: "instructor", email: "r@e.edu", office_hours: "Tue 2pm" }], meetings: [{ kind: "lecture", location: "1571 GGBL" }] });
    expect(courseFieldFills({ professor: null, professor_email: null, office_hours: null, classroom: null, description: null }, info)).toEqual({ professor: "Dr. R", professor_email: "r@e.edu", office_hours: "Tue 2pm", classroom: "1571 GGBL", description: "About C++." });
    expect(courseFieldFills({ professor: "Mine", professor_email: "m@e.edu", office_hours: "mine", classroom: "mine", description: "mine" }, info)).toEqual({});
  });
});

describe("schemas", () => {
  it("accepts an empty extraction and cleans bad values", () => {
    expect(EMPTY_COURSE_INFO.people).toEqual([]);
    const i = courseInfoSchema.parse({ meetings: [{ kind: "weird", start_time: "10am", days: "MW" }], people: [{ name: "X", role: "wizard" }] });
    expect(i.meetings[0]).toMatchObject({ kind: "other", start_time: null });
    expect(i.people[0].role).toBe("other");
  });
  it("hashes content stably and detects changes", async () => {
    const a = rawCourseInfoSchema.parse({ syllabus_text: "hello", people: [{ name: "A B" }] });
    expect(await rawHash(a)).toBe(await rawHash(rawCourseInfoSchema.parse({ syllabus_text: "hello", people: [{ name: "A B" }] })));
    expect(await rawHash(a)).not.toBe(await rawHash({ ...a, syllabus_text: "hello!" }));
  });
});

describe("display helpers", () => {
  it.each([["Mon/Wed", [1, 3]], ["MWF", [1, 3, 5]], ["TuTh", [2, 4]], ["Tuesday and Thursday", [2, 4]], ["Mon, Wed 10-11", [1, 3]], ["TTh", [2, 4]], ["Sat", [6]], ["", []], ["TBA", []], ["Daily", []]])("parseDays(%s)", (t, want) => expect(parseDays(t)).toEqual(want));
  it("formats time ranges", () => { expect(formatTimeRange("10:30", "12:00")).toBe("10:30 AM – 12 PM"); expect(formatTimeRange("19:00", null)).toBe("7 PM"); expect(formatTimeRange(null, null)).toBeNull(); });
  it("groups staff in display order", () => {
    const g = groupPeople(mergePeople([{ name: "B", role: "GSI", base_role: "ta", email: null, bio: null }, { name: "A", role: "TeacherEnrollment", base_role: "teacher", email: null, bio: null }, { name: "C", role: "ULA", base_role: "ta", email: null, bio: null }], []));
    expect(g.map((x) => x.title)).toEqual(["Instructors", "Graduate TAs / GSIs", "Instructional assistants (IAs)"]);
  });
  it("lists a day's classes in time order, excluding office hours and exams", () => {
    const meetings = (arr: object[]) => courseInfoSchema.parse({ meetings: arr }).meetings;
    const today = classesOnWeekday([
      { courseId: "a", meetings: meetings([{ kind: "lecture", days: "MW", start_time: "13:00", end_time: "14:30", location: "A" }, { kind: "office_hours", days: "MW", start_time: "09:00" }, { kind: "exam", days: "Mon" }]) },
      { courseId: "b", meetings: meetings([{ kind: "lab", days: "Mon", start_time: "09:00", end_time: "10:00" }]) },
    ], 1);
    expect(today.map((c) => `${c.courseId}:${c.kind}`)).toEqual(["b:lab", "a:lecture"]);
    expect(classesOnWeekday([], 1)).toEqual([]);
  });
});

import { toGeminiJsonSchema, syllabusExtractionSchema } from "../ai/schemas";
import { capCourseInfo } from "./schemas";

describe("schemas sent to Gemini", () => {
  const UNSUPPORTED = ["maxLength", "minLength", "maxItems", "minItems", "pattern", "default", "format", "$schema"];
  it("carry no size/pattern constraints (Gemini rejects them as too complex), but remain strict locally", () => {
    for (const schema of [courseInfoSchema, syllabusExtractionSchema]) {
      const text = JSON.stringify(toGeminiJsonSchema(schema));
      for (const k of UNSUPPORTED) expect(text, k).not.toContain(`"${k}"`);
    }
    expect(courseInfoSchema.safeParse({ people: [{ name: "" }] }).success).toBe(false); // local validation still rejects bad data
  });
  it("one over-long list or string never invalidates the whole result; it is trimmed instead", () => {
    const parsed = courseInfoSchema.parse({
      summary: "s".repeat(2000), links: Array.from({ length: 90 }, (_, i) => ({ label: `L${i}`, url: `https://x.edu/${i}` })),
      people: [{ name: "N".repeat(500), role: "ta", office_hours: "o".repeat(900) }], key_info: [{ label: "k", value: "v".repeat(1500) }],
    });
    const capped = capCourseInfo(parsed);
    expect(capped.summary!.length).toBe(700);
    expect(capped.links).toHaveLength(40);
    expect(capped.people[0].name.length).toBe(120);
    expect(capped.people[0].office_hours!.length).toBe(300);
    expect(capped.key_info[0].value.length).toBe(400);
  });
});

import { attachOfficeHours } from "./merge";
describe("attachOfficeHours", () => {
  const person = (name: string, role = "ta") => ({ name, role: role as never, title: null, email: null, office_hours: null as string | null, location: null as string | null, notes: null, source: "canvas" as const });
  const mt = (o: object) => courseInfoSchema.parse({ meetings: [{ kind: "office_hours", ...o }] }).meetings;
  it("puts an office-hours block on the person it names (by full or unique first/last name)", () => {
    const r = attachOfficeHours([person("Sam Lee"), person("Priya Natarajan"), person("James Juett", "instructor")], [
      ...mt({ person: "Sam Lee", days: "Thu", start_time: "16:00", end_time: "17:00", location: "Duderstadt Center" }),
      ...mt({ title: "Priya OH", days: "Mon", start_time: "18:00", end_time: "19:00" }),
    ]);
    expect(r[0]).toMatchObject({ office_hours: "Thu 4 PM – 5 PM · Duderstadt Center", location: "Duderstadt Center" });
    expect(r[1].office_hours).toBe("Mon 6 PM – 7 PM");
    expect(r[2].office_hours).toBeNull();
  });
  it("leaves ambiguous or unnamed blocks alone and never overwrites what's already there", () => {
    const a = person("Sam Lee"), b = person("Sam Park");
    expect(attachOfficeHours([a, b], mt({ person: "Sam", days: "Tue" })).every((p) => p.office_hours === null)).toBe(true);
    expect(attachOfficeHours([a], mt({ days: "Tue" }))[0].office_hours).toBeNull();
    expect(attachOfficeHours([{ ...a, office_hours: "mine" }], mt({ person: "Sam Lee", days: "Tue" }))[0].office_hours).toBe("mine");
  });
});

import { cleanLinkLabel, curateLinks, formatDays, isCanvasNav, isGenericTitle } from "./view";

describe("link curation (real-world noise)", () => {
  const L = (label: string, url: string, kind = "other") => ({ label, url, kind: kind as never });
  const raw = [
    L("Home", "https://umich.instructure.com/courses/123"), L("Announcements", "https://umich.instructure.com/courses/123/announcements"), L("Assignments", "https://umich.instructure.com/courses/123/assignments"),
    L("Grades", "https://umich.instructure.com/courses/123/grades"), L("People", "https://umich.instructure.com/courses/123/users"), L("Syllabus", "https://umich.instructure.com/courses/123/assignments/syllabus"),
    L("Piazza 1.3", "https://piazza.com/class/x", "forum"), L("Zoom 1.3", "https://umich.zoom.us/", "meeting"), L("Gradescope", "https://gradescope.com/courses/1", "gradescope"),
    L("Remote access to CAEN Windows Computers Links to an external site.", "https://caen.example/remote"),
    L("Resolving Security Risk Error when downloading/opening Access or Excel Files", "https://caen.example/err"),
    L("Download Resolving Security Risk Error when downloading/opening Access or Excel Files", "https://caen.example/err.pdf"),
    L("Lecture Recordings", "https://umich.instructure.com/courses/123/external_tools/5"), L("Lecture Recordings", "https://umich.instructure.com/courses/123/external_tools/6"),
    L("Python for Data Analysis", "https://oreilly.com/x", "textbook"),
  ];
  const c = curateLinks(raw, 5);
  it("drops Canvas's own navigation and boilerplate, merges near-duplicates, and puts tools first", () => {
    const labels = c.all.map((l) => l.label);
    for (const nav of ["Home", "Announcements", "Assignments", "Grades", "People", "Syllabus"]) expect(labels).not.toContain(nav);
    expect(labels).toContain("Remote access to CAEN Windows Computers");               // boilerplate stripped
    expect(labels.filter((l) => /Resolving Security Risk/.test(l))).toHaveLength(1);   // "Download X" collapsed into "X"
    expect(labels.filter((l) => l === "Lecture Recordings")).toHaveLength(1);          // same name twice
    expect(labels.slice(0, 3)).toEqual(["Piazza 1.3", "Gradescope", "Zoom 1.3"]);      // forum, gradescope, meeting first
    expect(labels[labels.length - 1]).toBe("Python for Data Analysis");                 // textbooks last
  });
  it("shows a short list up front and the rest behind 'more'", () => {
    expect(c.primary).toHaveLength(5);
    expect(c.more.length).toBe(c.all.length - 5);
  });
  it("helpers", () => {
    expect(cleanLinkLabel("Getting Started with U-M Net VPN Links to an external site.")).toBe("Getting Started with U-M Net VPN");
    expect(isCanvasNav("Whatever", "https://x.instructure.com/courses/9/grades")).toBe(true);
    expect(isCanvasNav("Piazza", "https://piazza.com/class/x")).toBe(false);
    // a real tool whose URL happens to look like /courses/<id> is NOT Canvas navigation
    expect(isCanvasNav("Gradescope", "https://www.gradescope.com/courses/9")).toBe(false);
    expect(isCanvasNav("Home", "https://eecs280.org/")).toBe(false);
    expect(isCanvasNav("Home", "https://canvas.school.edu/courses/9", ["canvas.school.edu"])).toBe(true);
  });
});

describe("schedule wording", () => {
  it.each([["Tuesdays and Thursdays", "Tue/Thu"], ["Mon/Wed", "Mon/Wed"], ["MWF", "Mon–Fri".replace("–Fri", "/Wed/Fri").replace("Mon–", "Mon")], ["Mon, Tue, Wed, Thu, Fri", "Mon–Fri"], ["TBA", "TBA"], ["", null]])("formatDays(%s)", (t, want) => {
    expect(formatDays(t)).toBe(want);
  });
  it("treats boring titles as noise", () => {
    for (const t of ["Class Time", "Lecture", "lab", "Meeting times", null, "  "]) expect(isGenericTitle(t as never), String(t)).toBe(true);
    for (const t of ["Open help room", "Midterm exam", "Section 003 lab"]) expect(isGenericTitle(t)).toBe(false);
  });
});
