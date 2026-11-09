import { describe, expect, it, vi } from "vitest";
import { CanvasAuthError, CanvasClient, CanvasConfigError, CanvasRateLimitError, normalizeCanvasBaseUrl, parseNextLink } from "./client";
import { decryptSecret, encryptSecret } from "./crypto";
import { guessType, mapAssignment, mapGroup } from "./map";
import { decideGrade, planAssignmentSync, planCategorySync } from "./plan";
import { describeDueChange, reconcileAssignment } from "./reconcile";
import type { Assignment, GradingCategoryRow } from "@/types/database";

const BASE = "https://canvas.example.edu";
const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" }, ...init });
const client = (fetchImpl: typeof fetch) => new CanvasClient({ baseUrl: BASE, token: "tok", fetchImpl, sleep: async () => {} });

describe("normalizeCanvasBaseUrl", () => {
  it("normalizes and strips paths", () => {
    expect(normalizeCanvasBaseUrl("canvas.example.edu/courses/1")).toBe(BASE);
    expect(normalizeCanvasBaseUrl(" https://Canvas.Example.edu/ ")).toBe(BASE);
  });
  it("rejects unsafe targets (SSRF)", () => {
    for (const bad of ["http://canvas.example.edu", "https://127.0.0.1", "https://localhost", "https://intranet", "https://10.0.0.5", "https://[::1]", "https://user:pw@canvas.example.edu", "https://printer.local", ""]) {
      expect(() => normalizeCanvasBaseUrl(bad), bad).toThrow(CanvasConfigError);
    }
  });
});

describe("parseNextLink", () => {
  it("finds rel=next", () => {
    const h = '<https://x/a?page=1>; rel="current", <https://x/a?page=2>; rel="next", <https://x/a?page=9>; rel="last"';
    expect(parseNextLink(h)).toBe("https://x/a?page=2");
    expect(parseNextLink('<https://x/a?page=1>; rel="current"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe("CanvasClient", () => {
  it("follows pagination and sends the bearer token", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url); calls.push({ url: u, auth: new Headers(init?.headers).get("authorization") });
      return u.includes("page=2") ? json([{ id: 3 }]) : json([{ id: 1 }, { id: 2 }], { headers: { link: `<${BASE}/api/v1/courses?page=2>; rel="next"` } });
    }) as unknown as typeof fetch;
    const out = await client(f).paginate<{ id: number }>("/api/v1/courses");
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
  });
  it("refuses to follow pagination to another host (token leak guard)", async () => {
    const f = vi.fn(async () => json([{ id: 1 }], { headers: { link: '<https://evil.example.com/x?page=2>; rel="next"' } })) as unknown as typeof fetch;
    await expect(client(f).paginate("/api/v1/courses")).rejects.toThrow(/different host/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("retries when rate limited, then succeeds", async () => {
    let n = 0;
    const f = (async () => (++n < 3 ? new Response("403 Forbidden (Rate Limit Exceeded)", { status: 403 }) : json({ id: 1 }))) as unknown as typeof fetch;
    expect(await client(f).get("/api/v1/users/self")).toEqual({ id: 1 });
    expect(n).toBe(3);
  });
  it("gives up after repeated rate limiting", async () => {
    const f = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    await expect(client(f).get("/x")).rejects.toThrow(CanvasRateLimitError);
  });
  it("surfaces expired tokens distinctly", async () => {
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(client(f).get("/x")).rejects.toThrow(CanvasAuthError);
  });
  it("a plain 403 (no access) is an API error, not a rate limit", async () => {
    const f = (async () => new Response("unauthorized", { status: 403 })) as unknown as typeof fetch;
    await expect(client(f).get("/x")).rejects.toThrow(/403/);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 7);
  it("round trips and uses a fresh IV", () => {
    const a = encryptSecret("super-secret-token", key), b = encryptSecret("super-secret-token", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("super-secret");
    expect(decryptSecret(a, key)).toBe("super-secret-token");
  });
  it("detects tampering and wrong keys", () => {
    const enc = encryptSecret("x", key);
    expect(() => decryptSecret(enc.slice(0, -2) + "AA", key)).toThrow();
    expect(() => decryptSecret(enc, Buffer.alloc(32, 8))).toThrow();
  });
});

describe("mapping", () => {
  it("guesses types", () => {
    expect(guessType({ name: "Midterm 1" })).toBe("exam");
    expect(guessType({ name: "Weekly check-in", submission_types: ["online_quiz"] })).toBe("quiz");
    expect(guessType({ name: "Lab 3" })).toBe("lab");
    expect(guessType({ name: "Homework 4", submission_types: ["online_upload"] })).toBe("homework");
  });
  it("skips unpublished and untitled items", () => {
    expect(mapAssignment({ id: 1, name: "x", published: false })).toBeNull();
    expect(mapAssignment({ id: 2, name: "  " })).toBeNull();
  });
  it("maps submissions and posted grades; unposted scores are not grades", () => {
    const graded = mapAssignment({ id: 3, name: "HW", points_possible: 10, submission: { workflow_state: "graded", score: 9, submitted_at: "2026-10-01T00:00:00Z" } })!;
    expect(graded.grade?.points).toBe(9);
    expect(graded.canvas_status).toBe("submitted");
    const pending = mapAssignment({ id: 4, name: "HW", submission: { workflow_state: "unsubmitted", score: null } })!;
    expect(pending.grade).toBeNull();
    expect(pending.canvas_status).toBeNull();
    expect(mapAssignment({ id: 5, name: "HW", submission: { workflow_state: "graded", excused: true, score: null } })!.grade).toEqual({ points: null, excused: true, graded_at: null });
  });
  it("strips HTML from descriptions", () => {
    expect(mapAssignment({ id: 6, name: "HW", description: "<p>Read <b>ch 3</b>&nbsp;now</p>" })!.description).toBe("Read ch 3 now");
  });
  it("maps groups; weights only apply when the course is weighted", () => {
    expect(mapGroup({ id: 1, name: "HW", group_weight: 20, rules: { drop_lowest: 1 } }, true)).toMatchObject({ weight: 20, drop_lowest: 1 });
    expect(mapGroup({ id: 1, name: "HW", group_weight: 20 }, false).weight).toBe(0);
  });
});

const local = (o: Partial<Assignment> = {}): Assignment => ({
  id: "L1", user_id: "u", course_id: "c", category_id: null, title: "Homework 4", description: null, type: "homework", due_at: "2026-11-12T23:59:00.000Z",
  estimated_minutes: null, priority: "medium", status: "not_started", points_possible: 100, is_extra_credit: false, source: "canvas",
  canvas_assignment_id: "50", user_edited_fields: [], is_demo: false, completed_at: null, created_at: "", external_url: null, ...o,
} as Assignment);
const incoming = (o = {}) => mapAssignment({ id: 50, name: "Homework 4", due_at: "2026-11-14T23:59:00Z", points_possible: 100, ...o })!;

describe("reconcileAssignment", () => {
  it("applies Canvas changes and records history", () => {
    const r = reconcileAssignment(local(), incoming());
    expect(r.patch.due_at).toBe("2026-11-14T23:59:00.000Z");
    expect(r.history).toEqual([{ field: "due_at", old_value: "2026-11-12T23:59:00.000Z", new_value: "2026-11-14T23:59:00.000Z" }]);
    expect(r.dueChange?.suppressed).toBe(false);
  });
  it("never overwrites a field the user edited; reports a conflict instead", () => {
    const r = reconcileAssignment(local({ user_edited_fields: ["due_at"] }), incoming());
    expect(r.patch.due_at).toBeUndefined();
    expect(r.conflicts).toEqual([{ field: "due_at", mine: "2026-11-12T23:59:00.000Z", canvas: "2026-11-14T23:59:00.000Z" }]);
    expect(r.dueChange?.suppressed).toBe(true);
  });
  it("is a no-op when nothing changed, and never blanks notes", () => {
    const r = reconcileAssignment(local({ due_at: "2026-11-14T23:59:00.000Z", description: "my notes" }), incoming());
    expect(r.patch).toEqual({});
    expect(r.conflicts).toEqual([]);
  });
  it("marks submitted from Canvas but never moves completed work backwards", () => {
    const sub = incoming({ due_at: "2026-11-12T23:59:00Z", submission: { workflow_state: "submitted", submitted_at: "2026-11-01T00:00:00Z" } });
    expect(reconcileAssignment(local(), sub).patch.status).toBe("submitted");
    expect(reconcileAssignment(local({ status: "completed" }), sub).patch.status).toBeUndefined();
    expect(reconcileAssignment(local({ user_edited_fields: ["status"] }), sub).patch.status).toBeUndefined();
  });
});

describe("describeDueChange", () => {
  it("matches the product copy", () => {
    expect(describeDueChange("IOE 310 Homework 4", "2026-11-12T20:00:00Z", "2026-11-14T20:00:00Z", "America/Detroit")).toBe("IOE 310 Homework 4 deadline changed from November 12 to November 14.");
    expect(describeDueChange("X", null, "2026-11-14T20:00:00Z")).toMatch(/now has a deadline/);
    expect(describeDueChange("X", "2026-11-14T20:00:00Z", null)).toMatch(/no longer has a deadline/);
  });
});

describe("planAssignmentSync", () => {
  it("separates inserts, updates, unchanged, and de-duplicates the payload", () => {
    const plan = planAssignmentSync({
      existing: [local(), local({ id: "L2", canvas_assignment_id: "51", title: "HW5", due_at: "2026-12-01T00:00:00.000Z" }), local({ id: "L3", canvas_assignment_id: "99", title: "Gone" }), local({ id: "M1", canvas_assignment_id: null, source: "manual", title: "Mine" })],
      incoming: [incoming(), mapAssignment({ id: 51, name: "HW5", due_at: "2026-12-01T00:00:00Z", points_possible: 100 })!, mapAssignment({ id: 52, name: "New one" })!, mapAssignment({ id: 52, name: "New one" })!],
      courseId: "c", courseLabel: "IOE 310", timeZone: "America/Detroit",
    });
    expect(plan.inserts.map((i) => i.canvas_assignment_id)).toEqual(["52"]);
    expect(plan.updates.map((u) => u.id)).toEqual(["L1"]);
    expect(plan.unchanged).toBe(1);
    expect(plan.missingFromCanvas).toBe(1); // L3 kept, not deleted; manual M1 not counted
    expect(plan.notifications.map((n) => n.kind).sort()).toEqual(["canvas_new", "deadline_changed"]);
    expect(plan.notifications.find((n) => n.kind === "deadline_changed")?.body).toContain("November 12 to November 14");
  });
  it("is idempotent: planning the same data again yields nothing to do", () => {
    const after = local({ due_at: "2026-11-14T23:59:00.000Z" });
    const plan = planAssignmentSync({ existing: [after], incoming: [incoming()], courseId: "c", courseLabel: "X", timeZone: "UTC" });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.notifications).toHaveLength(0);
  });
});

const cat = (o: Partial<GradingCategoryRow> & { canvas_group_id?: string | null }): GradingCategoryRow => ({ id: "k1", course_id: "c", name: "Homework", weight: 20, drop_lowest: 0, sort_order: 0, ...o } as GradingCategoryRow);
describe("planCategorySync", () => {
  it("links by name, creates new, and reports differences without changing the user's values", () => {
    const p = planCategorySync([cat({}), cat({ id: "k2", name: "Exams", weight: 50 })], [
      { id: 1, name: "homework", group_weight: 25, rules: { drop_lowest: 1 } }, { id: 2, name: "Exams", group_weight: 50 }, { id: 3, name: "Labs", group_weight: 25 },
    ], true);
    expect(p.link.map((l) => l.id).sort()).toEqual(["k1", "k2"]);
    expect(p.create.map((c) => c.name)).toEqual(["Labs"]);
    expect(p.differences).toHaveLength(1);
    expect(p.differences[0].name).toBe("Homework");
  });
});

describe("decideGrade", () => {
  it("writes new grades, skips identical ones, and protects manual entries", () => {
    expect(decideGrade(undefined, { points: 9, excused: false })).toBe("write");
    expect(decideGrade({ points_earned: 9, excused: false, source: "canvas" }, { points: 9, excused: false })).toBe("skip");
    expect(decideGrade({ points_earned: 8, excused: false, source: "canvas" }, { points: 9, excused: false })).toBe("write");
    expect(decideGrade({ points_earned: 8, excused: false, source: "manual" }, { points: 9, excused: false })).toBe("conflict");
    expect(decideGrade({ points_earned: 9, excused: false, source: "manual" }, { points: 9, excused: false })).toBe("skip");
  });
});
