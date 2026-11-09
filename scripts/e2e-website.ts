/**
 * Live end-to-end: crawl the REAL eecs280.org, extract with Gemini, apply to a REAL Supabase course that already has
 * overlapping syllabus/Canvas items, then re-apply to prove it is idempotent.
 *   npm run e2e:website         (needs migration 0005, Gemini key, "Confirm email" off)
 */
import { createClient } from "@supabase/supabase-js";
import { applyExtraction } from "../lib/server/apply-extraction";
import { crawlCourseSite } from "../lib/website/crawl";
import { extractFromWebsite } from "../lib/website/extract";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`); if (!ok) failures++; };

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: au, error: ae } = await sb.auth.signUp({ email: `e2e-web-${Date.now()}@example.com`, password: "Passw0rd!e2e" });
  if (ae || !au.session) throw new Error(`signUp failed: ${ae?.message ?? "no session (disable Confirm email)"}`);
  const uid = au.user!.id;
  const probe = await sb.from("course_websites").select("id").limit(1);
  if (probe.error) throw new Error(`Migration 0005 isn't applied (${probe.error.message}). Run supabase/migrations/…0005_course_websites.sql in the SQL editor first.`);

  const { data: course } = await sb.from("courses").insert({ user_id: uid, name: "Programming and Data Structures", code: "EECS 280", semester: "Fall 2026" }).select("id").single();
  const cid = course!.id as string;
  // Overlaps the website will meet: a syllabus item with a stale date, a syllabus exam with a stale date, a Canvas-linked exam, a personal task.
  await sb.from("assignments").insert([
    { user_id: uid, course_id: cid, title: "Project 1: Stats", type: "project", due_at: "2026-09-16T23:59:00Z", source: "syllabus", canvas_assignment_id: null, user_edited_fields: [] },
    { user_id: uid, course_id: cid, title: "Midterm", type: "exam", due_at: "2026-11-01T23:59:00Z", source: "syllabus", canvas_assignment_id: null, user_edited_fields: [] },
    { user_id: uid, course_id: cid, title: "Final Exam", type: "exam", due_at: "2026-12-14T15:30:00Z", source: "canvas", canvas_assignment_id: "99", user_edited_fields: [] },
    { user_id: uid, course_id: cid, title: "Study for project 2", type: "study", due_at: null, source: "manual", canvas_assignment_id: null, user_edited_fields: [] },
  ]);

  console.log("Crawling + extracting https://eecs280.org/ (live)…");
  const crawl = await crawlCourseSite("https://eecs280.org/");
  const { data: ex } = await extractFromWebsite(crawl, { courseName: "EECS 280", semester: "Fall 2026" });
  check("extraction found projects, exams and a grading breakdown", ex.assignments.length >= 8 && ex.grading.categories.length >= 3, `${ex.assignments.length} assignments`);

  const opts = { updateCourse: false, importCategories: true, assignmentIdx: ex.assignments.map((_, i) => i), dateIdx: ex.important_dates.flatMap((d, i) => (d.date ? [i] : [])), timeZone: "America/Detroit" };
  const r1 = await applyExtraction(sb, uid, cid, ex, opts, "website");
  console.log("apply #1:", JSON.stringify(r1));

  const { data: rows } = await sb.from("assignments").select("title, type, source, due_at, external_url, canvas_assignment_id").eq("course_id", cid);
  const all = rows ?? [];
  const p1 = all.filter((a) => /^project 1\b/i.test(a.title));
  check("Project 1 not duplicated (the syllabus row was matched)", p1.length === 1, p1.map((a) => a.title).join(" | "));
  check("Project 1 date corrected to the website's Fri Sep 18, 8pm ET", !!p1[0] && new Date(p1[0].due_at!).toISOString() === "2026-09-19T00:00:00.000Z", p1[0]?.due_at ?? "");
  check("Project 1 got its spec link", !!p1[0]?.external_url && p1[0].external_url.startsWith("https://"));
  const mid = all.filter((a) => a.type === "exam" && /midterm/i.test(a.title) && !/alternate/i.test(a.title));
  check("Midterm matched (one row) and corrected to Mon Nov 2, 7pm ET", mid.length === 1 && new Date(mid[0].due_at!).toISOString() === "2026-11-03T00:00:00.000Z", mid.map((m) => m.due_at).join());
  const fin = all.filter((a) => a.type === "exam" && /final/i.test(a.title) && !/alternate/i.test(a.title));
  check("Canvas-linked Final Exam untouched, not duplicated", fin.length === 1 && fin[0].canvas_assignment_id === "99" && fin[0].due_at === "2026-12-14T15:30:00+00:00", JSON.stringify(fin));
  check("alternate exam sittings are not assignments", !all.some((a) => /alternate/i.test(a.title)));
  check("new projects were added with source 'website'", all.filter((a) => a.source === "website" && a.type === "project").length >= 4);
  check("personal study task untouched", all.some((a) => a.title === "Study for project 2" && a.source === "manual"));
  const { data: ev } = await sb.from("calendar_events").select("title, source").eq("course_id", cid);
  check("registrar dates / holidays became calendar events", (ev ?? []).length >= 3 && (ev ?? []).every((e) => e.source === "website"), String((ev ?? []).length));
  const { data: cats } = await sb.from("grading_categories").select("name, weight").eq("course_id", cid);
  check("grading categories imported", (cats ?? []).length >= 3 && Math.round((cats ?? []).reduce((s, c) => s + Number(c.weight), 0)) === 100, (cats ?? []).map((c) => `${c.name} ${c.weight}`).join(", "));
  const { data: hist } = await sb.from("assignment_history").select("field, source").eq("field", "due_at");
  check("date corrections recorded in history", (hist ?? []).length >= 2 && (hist ?? []).every((h) => h.source === "website"));
  const { data: notes } = await sb.from("notifications").select("kind").eq("kind", "deadline_changed");
  check("a 'deadline changed' notification was created", (notes ?? []).length >= 1);

  const before = all.length;
  const r2 = await applyExtraction(sb, uid, cid, ex, opts, "website");
  const after = (await sb.from("assignments").select("id").eq("course_id", cid)).data ?? [];
  check("re-applying is idempotent (nothing added, no further date changes)", r2.assignments === 0 && r2.dateChanges === 0 && after.length === before, JSON.stringify(r2));

  await sb.from("courses").delete().eq("id", cid);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
