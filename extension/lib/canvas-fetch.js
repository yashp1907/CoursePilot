// Read-only Canvas fetching that runs with the student's own browser session (cookies).
// Pure module (no chrome.* APIs) so it can be unit tested. Only GET requests, only to the configured origin.

export class NotLoggedInError extends Error {
  constructor() { super("Canvas didn't return data. Make sure you're logged into Canvas in this browser, then try again."); this.code = "not_logged_in"; }
}

/** Canvas prefixes some JSON with `while(1);`; an HTML body means we were bounced to a login page. */
export function parseCanvasJson(text) {
  const t = String(text).replace(/^\s*while\(1\);\s*/, "").trim();
  if (t.startsWith("<")) throw new NotLoggedInError();
  try { return JSON.parse(t); } catch { throw new NotLoggedInError(); }
}

export function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}

export function createSession(origin, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), gapMs = 120, maxRetries = 3 } = {}) {
  const base = new URL(origin).origin;
  let last = 0;

  async function request(url) {
    if (new URL(url).origin !== base) throw new Error("Refusing to request a different host.");
    for (let attempt = 0; ; attempt++) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetchImpl(url, { method: "GET", credentials: "include", headers: { Accept: "application/json+canvas-string-ids, application/json" }, redirect: "follow" });
      if (res.status === 401) throw new NotLoggedInError();
      const body = res.status === 403 ? await res.clone().text().catch(() => "") : "";
      if (res.status === 429 || (res.status === 403 && /rate limit/i.test(body))) {
        if (attempt >= maxRetries) throw new Error("Canvas is rate limiting requests. Try again in a few minutes.");
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
      if (!res.ok) { const e = new Error(`Canvas returned ${res.status}`); e.status = res.status; throw e; }
      return res;
    }
  }

  function url(path, params) {
    const u = new URL(path, base);
    for (const [k, v] of Object.entries(params || {})) {
      if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, String(x)));
      else if (v !== undefined) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  return {
    origin: base,
    async get(path, params) {
      return parseCanvasJson(await (await request(url(path, params))).text());
    },
    async paginate(path, params, maxPages = 40) {
      const out = [];
      let next = url(path, { per_page: 100, ...params });
      for (let i = 0; next && i < maxPages; i++) {
        const res = await request(next);
        const data = parseCanvasJson(await res.text());
        if (Array.isArray(data)) out.push(...data);
        next = nextLink(res.headers.get("link"));
      }
      return out;
    },
  };
}

import { collectCourseInfo } from "./course-info.js";

const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : s);

/** Fetch courses, assignment groups, assignments (with the student's submission) and announcements. */
export async function fetchAllCanvasData(session, onProgress = () => {}, now = new Date()) {
  const me = await session.get("/api/v1/users/self");
  const courses = (await session.paginate("/api/v1/courses", { enrollment_state: "active", "include[]": ["term"] }))
    .filter((c) => (c.name || c.course_code) && !c.access_restricted_by_date);
  const since = new Date(+now - 60 * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const [i, course] of courses.entries()) {
    onProgress({ step: i, total: courses.length, label: course.course_code || course.name });
    try {
      const groups = await session.paginate(`/api/v1/courses/${course.id}/assignment_groups`, { "include[]": ["rules"] }).catch(() => []);
      const assignments = (await session.paginate(`/api/v1/courses/${course.id}/assignments`, { "include[]": ["submission"], order_by: "due_at" }))
        .map((a) => ({ ...a, description: clip(a.description, 6000) }));
      const announcements = await session.paginate("/api/v1/announcements", { "context_codes[]": [`course_${course.id}`], start_date: since, active_only: true }, 2).catch(() => []);
      const info = await collectCourseInfo(session, course.id, { baseUrl: session.origin, now }).catch(() => null);
      out.push({ course, groups, assignments, announcements: announcements.slice(0, 40).map((a) => ({ ...a, message: clip(a.message, 4000) })), info });
    } catch (e) {
      if (e instanceof NotLoggedInError) throw e;
      out.push({ course, groups: [], assignments: [], announcements: [], error: e instanceof Error ? e.message : "Couldn't load this course" });
    }
  }
  onProgress({ step: courses.length, total: courses.length, label: "Done" });
  return { user: me?.name ?? null, courses: out };
}
