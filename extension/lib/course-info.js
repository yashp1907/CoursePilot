// Collects everything useful about ONE Canvas course (syllabus tab, home page, key pages, staff, sections, calendar,
// tabs, modules). Shared by the browser extension (cookie session) and the server (token session): `session` only
// needs get(path, params) and paginate(path, params, maxPages). Read-only; best-effort (each part may fail alone).
// PRIVACY: only teacher/TA/designer enrollments are requested. Student rosters are never fetched.

const clip = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) : s);

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&ndash;": "–", "&mdash;": "—", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&hellip;": "…" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g) => {
  if (ENTITIES[m.toLowerCase()]) return ENTITIES[m.toLowerCase()];
  if (g[0] === "#") { const code = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : m; }
  return m;
});

function resolveHttp(href, base) {
  try { const u = new URL(href, base); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
}

/** HTML -> readable text without a DOM (works in a service worker): headings, lists, table rows, [text](url) links. */
export function htmlToText(html, baseUrl) {
  let s = String(html ?? "");
  s = s.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, d, sq, inner) => {
    const href = resolveHttp(decode(d ?? sq ?? ""), baseUrl);
    const text = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    return text && href ? `[${text}](${href})` : text;
  });
  s = s.replace(/<\/(td|th)>\s*<(td|th)\b[^>]*>/gi, " | ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/tr>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>/gi, "\n\n## ").replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|li|table|section|article|blockquote|dt|dd|pre|tbody|thead)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(s).split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const RELEVANT_PAGE = /syllabus|schedule|staff|contact|instructor|teaching|office[- ]?hours|polic|about|info|welcome|logistics|grading|resources|getting started|overview|course (home|page)|faq|calendar|lecture|section|lab/i;
const BASE_ROLE = { TeacherEnrollment: "teacher", TaEnrollment: "ta", DesignerEnrollment: "designer", teacher: "teacher", ta: "ta", designer: "designer" };

export const LIMITS = { pageChars: 12000, totalChars: 70000, pages: 7, people: 60, events: 60, tabs: 30, modules: 40, moduleItems: 12, sections: 30 };

/** @returns {Promise<object>} raw course info (plain JSON, size-capped) */
export async function collectCourseInfo(session, courseId, { baseUrl, now = new Date() } = {}) {
  const base = baseUrl;
  const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
  const raw = { syllabus_text: null, pages: [], people: [], sections: [], events: [], tabs: [], modules: [] };
  let budget = LIMITS.totalChars;
  const take = (text) => { const t = clip(text, Math.min(LIMITS.pageChars, Math.max(0, budget))) ?? ""; budget -= t.length; return t; };

  const course = await safe(() => session.get(`/api/v1/courses/${courseId}`, { "include[]": ["syllabus_body", "term"] }), null);
  if (course?.syllabus_body) raw.syllabus_text = take(htmlToText(course.syllabus_body, base)) || null;

  const front = await safe(() => session.get(`/api/v1/courses/${courseId}/front_page`), null);
  if (front?.body) raw.pages.push({ title: front.title || "Home page", url: front.html_url ? resolveHttp(front.html_url, base) : null, text: take(htmlToText(front.body, base)), front: true });

  const list = await safe(() => session.paginate(`/api/v1/courses/${courseId}/pages`, { sort: "title", published: true }, 3), []);
  const picks = list.filter((p) => p?.url && p.url !== front?.url && RELEVANT_PAGE.test(p.title ?? "")).slice(0, LIMITS.pages);
  for (const p of picks) {
    if (budget <= 0) break;
    const full = await safe(() => session.get(`/api/v1/courses/${courseId}/pages/${encodeURIComponent(p.url)}`), null);
    if (full?.body) raw.pages.push({ title: full.title || p.title, url: full.html_url ? resolveHttp(full.html_url, base) : null, text: take(htmlToText(full.body, base)) });
  }
  raw.pages = raw.pages.filter((p) => p.text && p.text.length > 40);

  // Staff only: instructors, TAs (incl. custom roles such as GSI/IA/ULA that sit on top of those types), designers.
  const users = await safe(() => session.paginate(`/api/v1/courses/${courseId}/users`, { "enrollment_type[]": ["teacher", "ta", "designer"], "include[]": ["enrollments", "email", "bio"] }, 3), []);
  for (const u of users.slice(0, LIMITS.people)) {
    const staff = (u.enrollments ?? []).filter((e) => BASE_ROLE[e.type] || BASE_ROLE[e.role]);
    if (!staff.length) continue;                       // anyone without a staff enrollment is skipped, never stored
    const e = staff[0];
    raw.people.push({ name: clip(u.name || u.sortable_name || u.short_name || "", 120), role: clip(e.role || e.type?.replace(/Enrollment$/, "") || "", 60), base_role: BASE_ROLE[e.type] ?? BASE_ROLE[e.role], email: clip(u.email || u.login_id?.includes("@") ? (u.email || u.login_id) : null, 160) ?? null, bio: clip(u.bio ? htmlToText(u.bio, base) : null, 500) ?? null });
  }
  raw.people = raw.people.filter((p) => p.name);

  const sections = await safe(() => session.get(`/api/v1/courses/${courseId}/sections`), []);
  raw.sections = (Array.isArray(sections) ? sections : []).slice(0, LIMITS.sections).map((s) => ({ name: clip(s.name ?? "", 120), start: s.start_at ?? null, end: s.end_at ?? null })).filter((s) => s.name);

  const events = await safe(() => session.paginate("/api/v1/calendar_events", { "context_codes[]": [`course_${courseId}`], type: "event", start_date: new Date(+now - 7 * 864e5).toISOString().slice(0, 10), end_date: new Date(+now + 120 * 864e5).toISOString().slice(0, 10) }, 3), []);
  raw.events = events.slice(0, LIMITS.events).map((e) => ({ title: clip(e.title ?? "", 200), start: e.start_at ?? null, end: e.end_at ?? null, all_day: !!e.all_day, location: clip(e.location_name ?? null, 200) ?? null, description: e.description ? clip(htmlToText(e.description, base), 400) : null })).filter((e) => e.title);

  const tabs = await safe(() => session.get(`/api/v1/courses/${courseId}/tabs`), []);
  raw.tabs = (Array.isArray(tabs) ? tabs : []).filter((t) => t.hidden !== true && t.label).slice(0, LIMITS.tabs).map((t) => ({ label: clip(t.label, 80), url: t.html_url ? resolveHttp(t.html_url, base) : null, external: t.type === "external" }));

  const modules = await safe(() => session.paginate(`/api/v1/courses/${courseId}/modules`, { "include[]": ["items"] }, 2), []);
  raw.modules = modules.slice(0, LIMITS.modules).map((m) => ({ name: clip(m.name ?? "", 120), items: (m.items ?? []).slice(0, LIMITS.moduleItems).map((i) => clip(i.title ?? "", 120)).filter(Boolean) })).filter((m) => m.name);
  return raw;
}

export function hasAnyInfo(raw) {
  return !!(raw && (raw.syllabus_text || raw.pages?.length || raw.people?.length || raw.events?.length || raw.modules?.length || raw.tabs?.length));
}
