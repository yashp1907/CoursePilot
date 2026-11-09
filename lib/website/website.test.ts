import { describe, expect, it } from "vitest";
import { parseHtml } from "./html";
import { crawlCourseSite, pickRelevantLinks } from "./crawl";
import { isPrivateIp, robotsAllows, safeFetchText, validatePublicUrl, WebFetchError } from "./safe-fetch";
import { fixYearByWeekday } from "./dates";
import { postProcessWebsiteExtraction } from "./postprocess";
import { EMPTY_EXTRACTION, type SyllabusExtraction } from "@/lib/ai/schemas";
import { planSyllabusImport, type SyllabusItem } from "@/lib/syllabus-plan";

const SCHEDULE = `<!doctype html><html><head><title>EECS 280</title><script>var x=1</script><style>.a{}</style></head><body>
<nav><a href="#schedule">Schedule</a> <a href="syllabus.html">Syllabus</a> <a href="/archive/">Course Archive</a> <a href="https://edstem.org/us/courses/1">Q&amp;A</a></nav>
<h1>EECS 280 &mdash; Fall 2026</h1>
<div style="display:none">SECRET HIDDEN</div>
<h2 id="schedule">Schedule</h2>
<table><tr><th>Day</th><th>Lecture</th><th>Deadline</th></tr>
<tr><td>Week 4<br>Fri Sep 18</td><td>Lecture 7: Pointers</td><td><a href="https://eecs280staff.github.io/stats">Project 1</a> due at 8pm</td></tr>
<tr><td>Mon Nov 2</td><td>Midterm Exam 7-9pm</td><td></td></tr></table>
<ul><li>No office hours Tue</li><li>Alternate Midterm Exam</li></ul>
</body></html>`;

describe("parseHtml", () => {
  const p = parseHtml(SCHEDULE, "https://eecs280.org/");
  it("keeps table structure as rows, headings, lists and inline links", () => {
    expect(p.title).toBe("EECS 280");
    expect(p.text).toContain("## EECS 280");
    expect(p.text).toMatch(/Week 4\s*Fri Sep 18 \| Lecture 7: Pointers \| \[Project 1\]\(https:\/\/eecs280staff\.github\.io\/stats\) due at 8pm/);
    expect(p.text).toContain("Mon Nov 2 | Midterm Exam 7-9pm");
    expect(p.text).toContain("- Alternate Midterm Exam");
  });
  it("drops scripts, styles and hidden content", () => {
    expect(p.text).not.toMatch(/var x|SECRET HIDDEN|\.a\{/);
  });
  it("collects absolute links", () => {
    expect(p.links.map((l) => l.href)).toEqual(expect.arrayContaining(["https://eecs280.org/syllabus.html", "https://eecs280staff.github.io/stats", "https://eecs280.org/archive/"]));
  });
});

describe("pickRelevantLinks", () => {
  const links = ["syllabus.html", "schedule", "projects/p3", "/archive/", "staff", "https://other.edu/syllabus", "file.pdf", "calculator.html", "policies.html", "office-hours", "#top"].map((h) => ({ text: h, href: new URL(h, "https://c.edu/").toString() }));
  it("keeps same-site schedule/policy pages and skips archives, staff, files and other sites", () => {
    const picked = pickRelevantLinks(links, "https://c.edu/");
    expect(picked).toEqual(expect.arrayContaining(["https://c.edu/syllabus.html", "https://c.edu/schedule", "https://c.edu/projects/p3", "https://c.edu/policies.html"]));
    for (const bad of ["archive", "staff", "other.edu", ".pdf", "office-hours", "calculator"]) expect(picked.join()).not.toContain(bad);
  });
  it("respects the limit and ranks schedule/syllabus first", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ text: `Project ${i}`, href: `https://c.edu/project${i}` })).concat([{ text: "Schedule", href: "https://c.edu/schedule" }]);
    const picked = pickRelevantLinks(many, "https://c.edu/", 3);
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe("https://c.edu/schedule");
  });
});

describe("SSRF protection", () => {
  it("recognizes private and special addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "141.211.2.1", "172.32.0.1", "2607:f8b0:4004:800::200e"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("accepts only public https hostnames", () => {
    expect(validatePublicUrl("https://eecs280.org/#schedule").toString()).toBe("https://eecs280.org/");
    for (const bad of ["http://eecs280.org", "https://127.0.0.1", "https://localhost/x", "https://intranet/", "https://u:p@eecs280.org", "https://printer.local", "ftp://x.org", "not a url", "https://[::1]/", "javascript:alert(1)"]) expect(() => validatePublicUrl(bad), bad).toThrow(WebFetchError);
  });
});

const res = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const site = (pages: Record<string, string | Response>) => (async (u: string | URL | Request) => {
  const url = new URL(String(u));
  const hit = pages[url.pathname] ?? pages[url.href];
  if (!hit) return new Response("nope", { status: 404 });
  return hit instanceof Response ? hit : res(hit);
}) as unknown as typeof fetch;

describe("safeFetchText", () => {
  it("follows redirects but re-validates every hop (no hopping to a private host)", async () => {
    const f = site({ "/a": new Response("", { status: 302, headers: { location: "https://169.254.169.254/latest" } }) });
    await expect(safeFetchText("https://c.edu/a", { fetchImpl: f })).rejects.toThrow(/private|valid|IP/i);
    const f2 = site({ "/a": new Response("", { status: 302, headers: { location: "http://c.edu/b" } }) });
    await expect(safeFetchText("https://c.edu/a", { fetchImpl: f2 })).rejects.toThrow(/https/);
    const f3 = site({ "/a": new Response("", { status: 301, headers: { location: "/b" } }), "/b": "<p>ok</p>" });
    expect((await safeFetchText("https://c.edu/a", { fetchImpl: f3 })).text).toBe("<p>ok</p>");
  });
  it("reports logins, errors, unsupported types and oversize pages in plain words", async () => {
    await expect(safeFetchText("https://c.edu/x", { fetchImpl: site({ "/x": new Response("", { status: 403 }) }) })).rejects.toThrow(/login/);
    await expect(safeFetchText("https://c.edu/x", { fetchImpl: site({ "/x": new Response("", { status: 500 }) }) })).rejects.toThrow(/error \(500\)/);
    await expect(safeFetchText("https://c.edu/x", { fetchImpl: site({ "/x": new Response("%PDF", { headers: { "content-type": "application/pdf" } }) }) })).rejects.toThrow(/isn't a web page/);
    await expect(safeFetchText("https://c.edu/x", { fetchImpl: site({ "/x": "x".repeat(5000) }), maxBytes: 1000 })).rejects.toThrow(/too large/);
  });
  it("stops redirect loops", async () => {
    const f = site({ "/a": new Response("", { status: 302, headers: { location: "/a" } }) });
    await expect(safeFetchText("https://c.edu/a", { fetchImpl: f, maxRedirects: 3 })).rejects.toThrow(/too many/);
  });
});

describe("robots.txt", () => {
  it("honors Disallow for generic bots with Allow overrides", () => {
    const r = "User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: Googlebot\nDisallow: /";
    expect(robotsAllows(r, "/schedule")).toBe(true);
    expect(robotsAllows(r, "/private/x")).toBe(false);
    expect(robotsAllows(r, "/private/public/y")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/")).toBe(false);
    expect(robotsAllows("", "/")).toBe(true);
  });
});

describe("crawlCourseSite", () => {
  const pages = {
    "/robots.txt": "User-agent: *\nDisallow: /secret/",
    "/": `<html><title>Course</title><body><h2>Schedule</h2><table><tr><td>Fri Sep 18</td><td>Project 1 due 8pm</td></tr></table><a href="syllabus.html">Syllabus</a><a href="/archive/">Archive</a><p>${"filler text ".repeat(30)}</p></body></html>`,
    "/syllabus.html": `<html><title>Syllabus</title><body><h1>Grading</h1><p>${"Projects 40%. Exams 50%. ".repeat(20)}</p></body></html>`,
    "/archive/": "<html><body>old</body></html>",
  };
  it("reads the start page plus relevant same-site pages, and skips archives", async () => {
    const r = await crawlCourseSite("https://c.edu/", { fetchImpl: site(pages) });
    expect(r.pages.map((p) => new URL(p.url).pathname)).toEqual(["/", "/syllabus.html"]);
    expect(r.warnings).toEqual([]);
  });
  it("warns when a page is nearly empty (likely JavaScript-rendered)", async () => {
    const r = await crawlCourseSite("https://c.edu/", { fetchImpl: site({ "/": "<html><body><div id=root></div></body></html>" }) });
    expect(r.warnings.join()).toMatch(/JavaScript|login/);
  });
  it("refuses when robots.txt disallows the page, and survives a failing sub-page", async () => {
    await expect(crawlCourseSite("https://c.edu/secret/x", { fetchImpl: site({ "/robots.txt": "User-agent: *\nDisallow: /secret/", "/secret/x": "<p>x</p>" }) })).rejects.toThrow(/robots/);
    const r = await crawlCourseSite("https://c.edu/", { fetchImpl: site({ "/": pages["/"], "/syllabus.html": new Response("", { status: 500 }) }) });
    expect(r.pages).toHaveLength(1);
    expect(r.warnings.join()).toMatch(/syllabus\.html/);
  });
});

describe("fixYearByWeekday", () => {
  it("confirms a year whose weekday matches the printed one", () => { expect(fixYearByWeekday("2026-09-18", "Fri")).toEqual({ date: "2026-09-18", status: "ok" }); });
  it("corrects the year when an adjacent year matches", () => {
    expect(fixYearByWeekday("2025-09-18", "Fri")).toEqual({ date: "2026-09-18", status: "fixed" }); // 9/18/2025 was a Thursday
    expect(fixYearByWeekday("2027-11-02", "Mon")).toEqual({ date: "2026-11-02", status: "fixed" });
  });
  it("flags a date that matches no nearby year, and leaves unchecked ones alone", () => {
    expect(fixYearByWeekday("2026-09-19", "Tue")).toEqual({ date: "2026-09-19", status: "mismatch" }); // would only match in 2028: too far to trust
    expect(fixYearByWeekday("2026-09-18", null)).toEqual({ date: "2026-09-18", status: "unchecked" });
    expect(fixYearByWeekday("2026-09-18", "Friday").status).toBe("ok");
  });
  it("handles Feb 29 without inventing a date", () => { expect(fixYearByWeekday("2027-02-29", "Mon")).toEqual({ date: "2027-02-29", status: "mismatch" }); /* flagged for review, never rewritten */ });
});

const base = (o: Partial<SyllabusExtraction>): SyllabusExtraction => ({ ...EMPTY_EXTRACTION, ...o });
const asg = (o: Record<string, unknown>) => ({ title: "Project 1", type: "project" as const, due_date: "2026-09-18", due_time: "20:00", points: null, category: null, recurrence: null, basis: "explicit" as const, source_text: null, url: null, weekday: "Fri", ...o });

describe("postProcessWebsiteExtraction", () => {
  const opts = { today: new Date("2026-09-01T12:00:00Z"), baseUrl: "https://eecs280.org/", crawlWarnings: ["Couldn't read /x"] };
  it("verifies years by weekday, makes links absolute https, and drops duplicates and untitled rows", () => {
    const out = postProcessWebsiteExtraction(base({ assignments: [asg({ due_date: "2025-09-18", url: "/p1" }), asg({ due_date: "2025-09-18" }), asg({ title: "  " }), asg({ title: "Evil", url: "javascript:alert(1)" })] }), opts);
    expect(out.assignments.map((a) => a.title)).toEqual(["Project 1", "Evil"]);
    expect(out.assignments[0].due_date).toBe("2026-09-18");
    expect(out.assignments[0].url).toBe("https://eecs280.org/p1");
    expect(out.assignments[1].url).toBeNull();
    expect(out.warnings.join("\n")).toMatch(/Corrected the year on 2 dates|Corrected the year on 1 date/);
    expect(out.warnings).toContain("Couldn't read /x");
  });
  it("warns about weekday mismatches, far-off dates, and empty results", () => {
    const out = postProcessWebsiteExtraction(base({ assignments: [asg({ due_date: "2026-09-19", weekday: "Tue" }), asg({ title: "Far", due_date: "2031-01-02", weekday: null })] }), opts);
    expect(out.warnings.join("\n")).toMatch(/doesn't fall on a Tue/);
    expect(out.warnings.join("\n")).toMatch(/more than a year from today/);
    expect(postProcessWebsiteExtraction(base({}), opts).warnings.join()).toMatch(/No assignments or deadlines/);
  });
});

describe("planSyllabusImport with a more current source (course website)", () => {
  const ex = (o: Record<string, unknown>) => ({ id: "e1", title: "Project 1", type: "project", due_at: "2026-09-16T23:59:00.000Z", points_possible: null, source: "syllabus", canvas_assignment_id: null, description: null, user_edited_fields: [], external_url: null, ...o }) as never;
  const item: SyllabusItem = { title: "Project 1", type: "project", due_at: "2026-09-19T00:00:00.000Z", points: null, category: null, recurrence: null, url: "https://eecs280staff.github.io/stats" };
  const opts = { updatableSources: ["website", "syllabus"] };

  it("proposes correcting an older syllabus/website date and fills in the spec link", () => {
    const plan = planSyllabusImport([ex({})], [item], [0], opts);
    expect(plan.changes).toEqual([expect.objectContaining({ id: "e1", from: "2026-09-16T23:59:00.000Z", to: "2026-09-19T00:00:00.000Z" })]);
    expect(plan.enrich[0].patch.external_url).toBe(item.url);
    expect(plan.inserts).toHaveLength(0);
  });
  it("never changes Canvas items, manual items, or a date the student edited", () => {
    expect(planSyllabusImport([ex({ source: "canvas", canvas_assignment_id: "7" })], [item], [0], opts).changes).toEqual([]);
    expect(planSyllabusImport([ex({ source: "manual" })], [item], [0], opts).changes).toEqual([]);
    expect(planSyllabusImport([ex({ user_edited_fields: ["due_at"] })], [item], [0], opts).changes).toEqual([]);
  });
  it("ignores trivial differences and does nothing when no source may update", () => {
    expect(planSyllabusImport([ex({ due_at: "2026-09-19T00:20:00.000Z" })], [item], [0], opts).changes).toEqual([]);
    expect(planSyllabusImport([ex({})], [item], [0]).changes).toEqual([]);
  });
  it("adds items that don't exist yet, once", () => {
    const plan = planSyllabusImport([], [item, { ...item }], [0, 1], opts);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("duplicate_in_syllabus");
  });
});

describe("category names stay plain", () => {
  it("strips trailing details from grading categories and from the matching assignment categories", () => {
    const ex = base({
      grading: { type: "weighted", scale: [], notes: null, categories: [
        { name: "Projects (P1=4%, P2=8%, P3=9%)", weight: 39, drop_lowest: null, basis: "explicit", source_text: null },
        { name: "Lab (all labs equal weight)", weight: 10, drop_lowest: 2, basis: "explicit", source_text: null },
        { name: "Midterm Exam", weight: 25, drop_lowest: null, basis: "explicit", source_text: null },
      ] },
      assignments: [asg({ category: "Projects (P1=4%, P2=8%, P3=9%)" }), asg({ title: "Midterm", category: "Midterm Exam", due_date: "2026-11-02", weekday: "Mon" })],
    });
    const out = postProcessWebsiteExtraction(ex, { today: new Date("2026-09-01T12:00:00Z"), baseUrl: "https://eecs280.org/" });
    expect(out.grading.categories.map((c) => c.name)).toEqual(["Projects", "Lab", "Midterm Exam"]);
    expect(out.assignments.map((a) => a.category)).toEqual(["Projects", "Midterm Exam"]);
  });
});
