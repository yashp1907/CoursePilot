import { describe, expect, it } from "vitest";
import { createSession, fetchAllCanvasData, nextLink, NotLoggedInError, parseCanvasJson } from "../../extension/lib/canvas-fetch.js";
import { PayloadSource, ingestSchema } from "./source";
import { mapAssignment, safeHttpsUrl } from "./map";
import { planAssignmentSync } from "./plan";

const ORIGIN = "https://canvas.example.edu";
const res = (body: unknown, init: ResponseInit = {}, prefix = "") => new Response(prefix + (typeof body === "string" ? body : JSON.stringify(body)), { status: 200, ...init });
const session = (f: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  createSession(ORIGIN, { fetchImpl: (async (u: string, i?: RequestInit) => f(String(u), i)) as unknown as typeof fetch, sleep: async () => {}, gapMs: 0 });

describe("extension fetch core", () => {
  it("strips Canvas's while(1); prefix and rejects login pages", () => {
    expect(parseCanvasJson('while(1);[{"id":"1"}]')).toEqual([{ id: "1" }]);
    expect(() => parseCanvasJson("<!DOCTYPE html><html>Log in</html>")).toThrow(NotLoggedInError);
    expect(() => parseCanvasJson("not json")).toThrow(NotLoggedInError);
  });
  it("sends the session (cookies) with read-only GETs and follows pagination", async () => {
    const seen: { url: string; method?: string; credentials?: string }[] = [];
    const s = session((url, init) => {
      seen.push({ url, method: init?.method, credentials: init?.credentials });
      return url.includes("page=2") ? res([{ id: 3 }]) : res([{ id: 1 }, { id: 2 }], { headers: { link: `<${ORIGIN}/api/v1/x?page=2>; rel="next"` } }, "while(1);");
    });
    expect((await s.paginate("/api/v1/x")).map((x: { id: number }) => x.id)).toEqual([1, 2, 3]);
    expect(seen.every((r) => r.method === "GET" && r.credentials === "include")).toBe(true);
  });
  it("refuses to follow a link to another host", async () => {
    const s = session(() => res([{ id: 1 }], { headers: { link: '<https://evil.example.com/x>; rel="next"' } }));
    await expect(s.paginate("/api/v1/x")).rejects.toThrow(/different host/);
  });
  it("backs off on rate limits and reports persistent ones", async () => {
    let n = 0;
    expect(await session(() => (++n < 3 ? new Response("403 Forbidden (Rate Limit Exceeded)", { status: 403 }) : res({ ok: 1 }))).get("/x")).toEqual({ ok: 1 });
    await expect(session(() => new Response("", { status: 429 })).get("/x")).rejects.toThrow(/rate limiting/);
  });
  it("401 means not logged in", async () => {
    await expect(session(() => new Response("{}", { status: 401 })).get("/x")).rejects.toThrow(NotLoggedInError);
  });
  it("collects everything per course and isolates a failing course", async () => {
    const s = session((url) => {
      const p = new URL(url).pathname;
      if (p === "/api/v1/users/self") return res({ name: "Alex" });
      if (p === "/api/v1/courses") return res([{ id: "1", name: "A", course_code: "IOE 310" }, { id: "2", name: "B" }, { id: "3", access_restricted_by_date: true, name: "Old" }]);
      if (p === "/api/v1/courses/1/assignment_groups") return res([{ id: "g", name: "HW" }]);
      if (p === "/api/v1/courses/1/assignments") return res([{ id: "a1", name: "HW1", description: "x".repeat(9000) }]);
      if (p === "/api/v1/courses/2/assignments") return new Response("forbidden", { status: 403 });
      if (p === "/api/v1/announcements") return res([]);
      return res([]);
    });
    const progress: string[] = [];
    const out = await fetchAllCanvasData(s, (p) => progress.push(p.label));
    expect(out.user).toBe("Alex");
    expect(out.courses.map((c: { course: { id: string } }) => c.course.id)).toEqual(["1", "2"]); // restricted course skipped
    expect(out.courses[0].assignments[0].description.length).toBe(6000); // payload trimmed
    expect(out.courses[1].error).toMatch(/403/);
    expect(progress.at(-1)).toBe("Done");
  });
  it("stops early (not a half-empty sync) when the session is logged out", async () => {
    await expect(fetchAllCanvasData(session(() => res("<html>login</html>")))).rejects.toThrow(NotLoggedInError);
  });
  it("nextLink parses rel=next", () => { expect(nextLink('<https://x/a?page=2>; rel="next"')).toBe("https://x/a?page=2"); expect(nextLink(null)).toBeNull(); });
});

describe("ingest validation", () => {
  const bundle = { course: { id: 1001, name: "Opt", course_code: "IOE 310" }, groups: [{ id: "1", name: "HW", group_weight: 20, rules: { drop_lowest: 1 } }],
    assignments: [{ id: "11", name: "HW 4", due_at: "2026-11-12T23:59:00Z", points_possible: 100, assignment_group_id: "1", html_url: "javascript:alert(1)" }], announcements: [] };
  it("accepts a well-formed upload and normalizes ids to strings", () => {
    const r = ingestSchema.parse({ baseUrl: ORIGIN, courses: [bundle] });
    expect(r.courses[0].course.id).toBe("1001");
    expect(r.timeZone).toBe("UTC");
  });
  it("rejects empty or oversized uploads and non-object junk", () => {
    expect(ingestSchema.safeParse({ baseUrl: ORIGIN, courses: [] }).success).toBe(false);
    expect(ingestSchema.safeParse({ baseUrl: ORIGIN, courses: Array(61).fill(bundle) }).success).toBe(false);
    expect(ingestSchema.safeParse("x").success).toBe(false);
    expect(ingestSchema.safeParse({ baseUrl: ORIGIN, courses: [{ ...bundle, assignments: Array(2001).fill(bundle.assignments[0]) }] }).success).toBe(false);
  });
  it("cleans bad values instead of trusting them, and drops unknown fields", () => {
    const r = ingestSchema.parse({ baseUrl: ORIGIN, courses: [{ ...bundle, assignments: [{ ...bundle.assignments[0], due_at: "someday", points_possible: "lots", evil: "<script>" }] }] });
    const a = r.courses[0].assignments[0] as Record<string, unknown>;
    expect(a.due_at).toBeNull();
    expect(a.points_possible).toBeNull();
    expect(a.evil).toBeUndefined();
  });
  it("only keeps https links (no javascript: URLs reach the database)", () => {
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://x.edu/a")).toBeNull();
    expect(safeHttpsUrl("https://canvas.example.edu/a")).toBe("https://canvas.example.edu/a");
    const r = ingestSchema.parse({ baseUrl: ORIGIN, courses: [bundle] });
    expect(mapAssignment(r.courses[0].assignments[0] as never)?.external_url).toBeNull();
  });
  it("PayloadSource serves the same data the sync expects, and surfaces per-course errors", async () => {
    const src = new PayloadSource(ingestSchema.parse({ baseUrl: ORIGIN, courses: [bundle, { ...bundle, course: { id: 2, name: "Bad" }, error: "Canvas returned 403" }] }).courses);
    expect((await src.courses()).map((c) => String(c.id))).toEqual(["1001", "2"]);
    expect((await src.assignments(1001)).length).toBe(1);
    await expect(src.assignments(2)).rejects.toThrow(/403/);
    const plan = planAssignmentSync({ existing: [], incoming: (await src.assignments(1001)).map((a) => mapAssignment(a)!), courseId: "c", courseLabel: "IOE 310", timeZone: "UTC" });
    expect(plan.inserts).toHaveLength(1);
  });
});
