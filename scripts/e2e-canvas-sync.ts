/**
 * Runs the REAL Canvas sync code against your REAL Supabase project, with a mock Canvas server standing in
 * for a school's Canvas. Verifies: idempotency, change detection, history, notifications, protection of the
 * student's own edits and grades, course auto-linking, and encrypted token storage.
 *
 *   npm run e2e:canvas
 *
 * Requires: migrations 0001 AND 0002 applied, "Confirm email" off, CANVAS_TOKEN_ENCRYPTION_KEY set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CanvasClient } from "../lib/canvas/client";
import { clientForConnection, saveConnection } from "../lib/canvas/connection";
import { runCanvasSync } from "../lib/canvas/sync";
import { PayloadSource, ingestSchema } from "../lib/canvas/source";
import { processCourseInfo } from "../lib/server/course-info";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`); if (!ok) failures++; };

type Asg = { id: number; name: string; due_at: string | null; points_possible: number; assignment_group_id: number; submission?: Record<string, unknown> };
const world = { assignments: [] as Asg[] };
const BASE = "https://canvas.example.edu";

const mockFetch = (async (input: string | URL | Request) => {
  const u = new URL(String(input));
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { "content-type": "application/json" } });
  if (u.pathname === "/api/v1/courses") return json([
    { id: 1001, name: "Optimization Methods", course_code: "IOE 310", apply_assignment_group_weights: true, term: { name: "Fall 2026" } },
    { id: 1002, name: "Intro Biology", course_code: "BIO 101", apply_assignment_group_weights: false },
  ]);
  if (u.pathname === "/api/v1/courses/1001/assignment_groups") return json([{ id: 1, name: "Homework", group_weight: 20, rules: { drop_lowest: 1 } }, { id: 2, name: "Exams", group_weight: 80 }]);
  if (u.pathname === "/api/v1/courses/1001") return json({ id: 1001, syllabus_body: "<h2>IOE 310 Syllabus</h2><p>Prerequisite: MATH 215. Grading: Homework 20%, Midterm 40%, Final 40%. Late work loses 10% per day for up to three days.</p>" });
  if (u.pathname === "/api/v1/courses/1001/front_page") return json({ title: "Welcome", html_url: `${BASE}/courses/1001`, body: "<h1>Welcome to IOE 310</h1><p>Lectures meet Monday and Wednesday 10:30am-12:00pm in 1571 GGBL. Lab sections meet Fridays 2-3pm in EECS 1311. Discussion forum: <a href='https://edstem.org/us/courses/555'>Ed Discussion</a>. Questions? Email ioe310-staff@example.edu</p>" });
  if (u.pathname === "/api/v1/courses/1001/pages") return json([{ url: "staff", title: "Staff & Office Hours" }, { url: "memes", title: "Fun memes" }]);
  if (u.pathname === "/api/v1/courses/1001/pages/staff") return json({ title: "Staff & Office Hours", html_url: `${BASE}/courses/1001/pages/staff`, body: "<p>Dr. Maria Rivera (instructor) holds office hours Tuesdays 2-3pm in BBB 3601. Sam Lee (GSI) holds office hours Thursdays 4-5pm in the Duderstadt Center. Pat Kim is an Instructional Assistant (IA).</p>" });
  if (u.pathname === "/api/v1/courses/1001/users") return json([
    { id: 1, name: "Dr. Maria Rivera", email: "rivera@example.edu", enrollments: [{ type: "TeacherEnrollment", role: "TeacherEnrollment" }] },
    { id: 2, name: "Sam Lee", email: "samlee@example.edu", enrollments: [{ type: "TaEnrollment", role: "GSI" }] },
    { id: 3, name: "Pat Kim", email: "patkim@example.edu", enrollments: [{ type: "TaEnrollment", role: "Instructional Assistant" }] },
    { id: 4, name: "Secret Student", email: "student@example.edu", enrollments: [{ type: "StudentEnrollment", role: "StudentEnrollment" }] },
  ]);
  if (u.pathname === "/api/v1/courses/1001/sections") return json([{ name: "Section 003" }]);
  if (u.pathname === "/api/v1/calendar_events") return json(!u.searchParams.getAll("context_codes[]").includes("course_1001") ? [] : [{ title: "Office hours: Sam", start_at: "2026-11-12T21:00:00Z", end_at: "2026-11-12T22:00:00Z", location_name: "Duderstadt Center" }]);
  if (u.pathname === "/api/v1/courses/1001/tabs") return json([{ label: "Gradescope", type: "external", html_url: `${BASE}/courses/1001/external_tools/9` }, { label: "Grades", type: "internal", html_url: "/courses/1001/grades" }]);
  if (u.pathname === "/api/v1/courses/1001/modules") return json([{ name: "Week 1: Linear programming", items: [{ title: "Lecture 1" }, { title: "HW 1" }] }]);
  if (u.pathname === "/api/v1/courses/1002/assignment_groups") return json([]);
  if (u.pathname === "/api/v1/courses/1001/assignments") return json(world.assignments);
  if (u.pathname === "/api/v1/courses/1002/assignments") return json([]);
  if (u.pathname === "/api/v1/announcements") return json([{ id: 7, title: "Welcome", message: "<p>Hi all</p>", posted_at: new Date().toISOString(), html_url: `${BASE}/a/7` }]);
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

const mockClient = () => new CanvasClient({ baseUrl: BASE, token: "tok", fetchImpl: mockFetch, sleep: async () => {} });

async function main() {
  if (!process.env.CANVAS_TOKEN_ENCRYPTION_KEY) throw new Error("Set CANVAS_TOKEN_ENCRYPTION_KEY in .env.local.");
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const { data: au, error: ae } = await sb.auth.signUp({ email: `e2e-canvas-${Date.now()}@example.com`, password: "Passw0rd!e2e" });
  if (ae || !au.session) throw new Error(`signUp failed: ${ae?.message ?? "no session (disable Confirm email)"}`);
  const uid = au.user!.id;

  // Migration 2 present?
  const probe = await sb.from("assignment_history").select("id").limit(1);
  if (probe.error) throw new Error(`Migration 0002 isn't applied (${probe.error.message}). Paste supabase/migrations/…0002… into the Supabase SQL editor first.`);

  // Encrypted token round trip through the owner-checked function
  await saveConnection(sb, uid, BASE, "token", { access: "super-secret-token-value-123" });
  const { data: conn } = await sb.from("canvas_connections").select("id, base_url, status").single();
  check("connection saved", !!conn?.id);
  const direct = await sb.from("canvas_connections").select("access_token_enc");
  check("encrypted token column NOT readable via normal select", !!direct.error);
  const cc = await clientForConnection(sb, conn!.id);
  check("server can decrypt token via canvas_secrets()", (cc as unknown as { token: string }).token === "super-secret-token-value-123");

  // Courses that already exist before Canvas ever syncs: Canvas should link to them, not duplicate them.
  await sb.from("courses").insert({ user_id: uid, name: "Biology", code: "BIO 101" });
  const { data: ioe } = await sb.from("courses").insert({ user_id: uid, name: "Optimization", code: "IOE 310" }).select("id").single();
  // ...and assignments the student already imported from the SYLLABUS (different wording, tentative dates).
  const { data: pre } = await sb.from("assignments").insert([
    { user_id: uid, course_id: ioe!.id, title: "Midterm", type: "exam", due_at: "2026-10-15T22:00:00Z", points_possible: null, source: "syllabus", priority: "high", description: "my study notes" },
    { user_id: uid, course_id: ioe!.id, title: "Homework 5", type: "homework", due_at: "2026-10-01T03:59:00Z", points_possible: null, source: "syllabus", priority: "medium", description: null },
    { user_id: uid, course_id: ioe!.id, title: "Study for exam", type: "study", due_at: null, points_possible: null, source: "manual", priority: "medium", description: null },
  ]).select("id, title");
  const preId = (t: string) => pre!.find((r) => r.title === t)!.id as string;

  const due1 = "2026-11-12T23:59:00Z", due2 = "2026-11-14T23:59:00Z";
  world.assignments = [
    { id: 11, name: "Homework 4", due_at: due1, points_possible: 100, assignment_group_id: 1 },
    { id: 12, name: "Homework 5", due_at: "2026-11-20T23:59:00Z", points_possible: 100, assignment_group_id: 1, submission: { workflow_state: "graded", score: 90, submitted_at: "2026-11-01T00:00:00Z", graded_at: "2026-11-02T00:00:00Z" } },
    { id: 13, name: "Midterm Exam", due_at: "2026-12-01T15:00:00Z", points_possible: 100, assignment_group_id: 2 },
  ];
  const run = () => runCanvasSync({ supabase: sb, userId: uid, connectionId: conn!.id, client: mockClient(), timeZone: "America/Detroit" });

  const s1 = await run();
  check("sync 1: both existing courses linked, none duplicated", s1.courses === 2 && s1.coursesCreated === 0, JSON.stringify({ c: s1.courses, created: s1.coursesCreated }));
  check("sync 1: 1 new assignment, 2 syllabus items ADOPTED (not duplicated), 1 grade, 1 announcement", s1.assignmentsNew === 1 && s1.assignmentsLinked === 2 && s1.gradesUpdated === 1 && s1.announcements === 2 /* the mock serves one announcement to each of 2 courses */, JSON.stringify(s1));
  const { data: adopted } = await sb.from("assignments").select("id, title, source, canvas_assignment_id, due_at, description, priority, type").in("id", [preId("Midterm"), preId("Homework 5")]);
  const mid0 = adopted!.find((a) => a.id === preId("Midterm"))!;
  check("syllabus Midterm row was adopted by Canvas (same row, Canvas id, Canvas date)", mid0.canvas_assignment_id === "13" && mid0.source === "canvas" && new Date(mid0.due_at).toISOString() === "2026-12-01T15:00:00.000Z", JSON.stringify(mid0));
  check("adopted row kept the student's notes, priority and type", mid0.description === "my study notes" && mid0.priority === "high" && mid0.type === "exam");
  check("Homework 5 adopted by Canvas HW 5 and carries its grade", adopted!.find((a) => a.id === preId("Homework 5"))!.canvas_assignment_id === "12");
  const { data: linkHist } = await sb.from("assignment_history").select("field").eq("field", "canvas_link");
  check("link recorded in history", (linkHist ?? []).length === 2);
  const { data: study } = await sb.from("assignments").select("canvas_assignment_id").eq("id", preId("Study for exam")).single();
  check("personal study task was NOT adopted", study!.canvas_assignment_id === null);
  const { data: courses } = await sb.from("courses").select("code, canvas_course_id");
  check("BIO 101 was linked, not duplicated", courses!.filter((c) => c.code === "BIO 101").length === 1 && courses!.find((c) => c.code === "BIO 101")?.canvas_course_id === "1002");
  const { data: cats } = await sb.from("grading_categories").select("name, weight, drop_lowest");
  check("grading categories created from Canvas groups", cats!.length === 2 && cats!.find((c) => c.name === "Homework")?.drop_lowest === 1 && Number(cats!.find((c) => c.name === "Exams")?.weight) === 80);
  const { data: a1 } = await sb.from("assignments").select("title, type, status, source, category_id").order("title");
  const canvasRows = a1!.filter((a) => a.source === "canvas");
  check("assignments typed, sourced and categorized", canvasRows.length === 3 && canvasRows.every((a) => a.category_id) && canvasRows.find((a) => a.title === "HW 5" || a.title === "Homework 5")?.status === "submitted", JSON.stringify(a1));

  // ---- Whole-course scrape: stored raw, staff only, change-detected, then understood by Gemini ----
  const probeInfo = await sb.from("course_info").select("id").limit(1);
  if (probeInfo.error) console.log("SKIP  course info checks: apply migration …0006_course_info.sql first");
  else {
    check("sync 1 queued course info for the course that had content", s1.infoQueued === 1, String(s1.infoQueued));
    const { data: ci } = await sb.from("course_info").select("status, raw, raw_hash").eq("course_id", ioe!.id).single();
    const rawText = JSON.stringify(ci!.raw);
    check("raw info holds syllabus tab, pages, tabs, modules and staff", /Prerequisite: MATH 215/.test(rawText) && /1571 GGBL/.test(rawText) && /Gradescope/.test(rawText) && /Week 1: Linear programming/.test(rawText) && ci!.status === "pending");
    check("PRIVACY: no student is stored, only staff", /Rivera/.test(rawText) && /Sam Lee/.test(rawText) && !/Secret Student|student@example/.test(rawText));
  }

  const s2 = await run();
  check("sync 2 (no change): idempotent, no duplicates", s2.assignmentsNew === 0 && s2.assignmentsUpdated === 0 && s2.gradesUpdated === 0, JSON.stringify({ n: s2.assignmentsNew, u: s2.assignmentsUpdated, g: s2.gradesUpdated }));
  check("exactly 3 Canvas assignments + 1 study task (no duplicates)", ((await sb.from("assignments").select("id")).data ?? []).length === 4);

  world.assignments[0].due_at = due2;
  const s3 = await run();
  check("sync 3: deadline change detected and applied", s3.assignmentsUpdated === 1 && s3.deadlineChanges === 1, JSON.stringify({ u: s3.assignmentsUpdated, d: s3.deadlineChanges }));
  const { data: note } = await sb.from("notifications").select("title, body").eq("kind", "deadline_changed");
  check("notification text matches product copy", note?.[0]?.body === "IOE 310 Homework 4 deadline changed from November 12 to November 14.", note?.[0]?.body ?? "none");
  const { data: hist } = await sb.from("assignment_history").select("field, old_value, new_value").eq("field", "due_at");
  check("history recorded for the Homework 4 deadline change (old 11-12 -> new 11-14)", !!hist?.some((h) => String(h.old_value).startsWith("2026-11-12") && String(h.new_value).startsWith("2026-11-14")), JSON.stringify(hist));
  const s3b = await run();
  check("re-running does not repeat the notification", ((await sb.from("notifications").select("id").eq("kind", "deadline_changed")).data ?? []).length === 1 && s3b.assignmentsUpdated === 0);

  // The student edits the due date themselves; Canvas changes it again: keep the student's value.
  const { data: hw4 } = await sb.from("assignments").select("id").eq("title", "Homework 4").single();
  const mine = "2026-11-13T12:00:00Z";
  await sb.from("assignments").update({ due_at: mine, user_edited_fields: ["due_at"] }).eq("id", hw4!.id);
  world.assignments[0].due_at = "2026-11-18T23:59:00Z";
  const s4 = await run();
  const { data: after } = await sb.from("assignments").select("due_at").eq("id", hw4!.id).single();
  check("sync 4: student's edited due date preserved", new Date(after!.due_at).toISOString() === new Date(mine).toISOString());
  check("sync 4: conflict reported", s4.conflicts.some((c) => c.includes("Homework 4")), s4.conflicts.join("; "));

  // The student typed a different grade manually; Canvas then posts one
  const { data: mid } = await sb.from("assignments").select("id").eq("title", "Midterm Exam").single();
  await sb.from("assignment_grades").insert({ user_id: uid, assignment_id: mid!.id, points_earned: 70, source: "manual" });
  world.assignments[2].submission = { workflow_state: "graded", score: 95, submitted_at: "2026-12-01T00:00:00Z", graded_at: "2026-12-02T00:00:00Z" };
  const s5 = await run();
  const { data: g } = await sb.from("assignment_grades").select("points_earned, source").eq("assignment_id", mid!.id).single();
  check("sync 5: manual grade not silently overwritten", Number(g!.points_earned) === 70 && g!.source === "manual" && s5.conflicts.some((c) => c.includes("Midterm")));

  if (!probeInfo.error) {
    check("sync 2 (nothing changed) did not re-queue course info", s2.infoQueued === 0, String(s2.infoQueued));
    console.log("Reading the course pages with Gemini (live)…");
    const res = await processCourseInfo(sb);
    check("course pages were understood", res.processed?.status === "ready", JSON.stringify(res.processed));
    const { data: ci2 } = await sb.from("course_info").select("info, status").eq("course_id", ioe!.id).single();
    const info = ci2!.info as { people: { name: string; role: string; email: string | null; office_hours: string | null; source: string }[]; meetings: { kind: string; days: string | null; start_time: string | null; location: string | null }[]; links: { label: string; url: string; kind: string }[]; contacts: { type: string; value: string }[] };
    const sam = info.people.find((p) => /sam/i.test(p.name)), pat = info.people.find((p) => /pat/i.test(p.name));
    check("Canvas staff are authoritative: roles mapped (GSI -> ta, IA -> ia) with emails", sam?.role === "ta" && sam.email === "samlee@example.edu" && pat?.role === "ia" && info.people.find((p) => /rivera/i.test(p.name))?.role === "instructor", JSON.stringify(info.people.map((p) => `${p.name}:${p.role}`)));
    check("office hours from the pages were attached to the right person", /thu/i.test(sam?.office_hours ?? "") && /tue/i.test(info.people.find((p) => /rivera/i.test(p.name))?.office_hours ?? ""));
    check("no student appears in the structured info", !info.people.some((p) => /student/i.test(p.name)));
    check("lecture time and room extracted", info.meetings.some((m) => m.kind === "lecture" && /1571/.test(m.location ?? "") && m.start_time === "10:30"), JSON.stringify(info.meetings.filter((m) => m.kind === "lecture")));
    check("forum link and Gradescope tab became links; course email became a contact", info.links.some((l) => l.kind === "forum") && info.links.some((l) => l.kind === "gradescope") && info.contacts.some((c) => c.value === "ioe310-staff@example.edu"));
    const { data: crs } = await sb.from("courses").select("professor, professor_email, classroom").eq("id", ioe!.id).single();
    check("empty course fields were filled from Canvas (professor, email, classroom)", /Rivera/.test(crs!.professor ?? "") && crs!.professor_email === "rivera@example.edu" && /1571/.test(crs!.classroom ?? ""), JSON.stringify(crs));
    const again = await processCourseInfo(sb);
    check("nothing pending afterwards", again.processed === null && again.remaining === 0);
  }

  const { data: sh } = await sb.from("canvas_sync_history").select("status");
  check("sync history recorded", (sh ?? []).length === 6 && sh!.every((r) => r.status === "success"));

  // Extension path: same data arrives as an uploaded payload (no token), reconciled by the same code.
  const bundles = ingestSchema.parse({
    baseUrl: BASE,
    courses: [{ course: { id: 1001, name: "Optimization Methods", course_code: "IOE 310", apply_assignment_group_weights: true }, groups: [{ id: 1, name: "Homework", group_weight: 20, rules: { drop_lowest: 1 } }, { id: 2, name: "Exams", group_weight: 80 }],
      assignments: world.assignments, announcements: [] }],
  }).courses;
  const ext = await runCanvasSync({ supabase: sb, userId: uid, connectionId: conn!.id, client: new PayloadSource(bundles), timeZone: "America/Detroit" });
  check("extension payload sync: no duplicates, student's edits still protected", ext.assignmentsNew === 0 && ((await sb.from("assignments").select("id")).data ?? []).length === 4 && ext.conflicts.length > 0, JSON.stringify({ n: ext.assignmentsNew, c: ext.conflicts.length }));
  const evil = ingestSchema.parse({ baseUrl: BASE, courses: [{ course: { id: 1001, name: "Optimization Methods", course_code: "IOE 310" }, groups: [], announcements: [], assignments: [{ id: 99, name: "Sneaky", html_url: "javascript:alert(1)", points_possible: 5 }] }] }).courses;
  await runCanvasSync({ supabase: sb, userId: uid, connectionId: conn!.id, client: new PayloadSource(evil), timeZone: "UTC" });
  const { data: sneaky } = await sb.from("assignments").select("external_url").eq("title", "Sneaky").single();
  check("javascript: links are never stored", sneaky?.external_url === null);

  await sb.from("courses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  check("cleanup cascaded", ((await sb.from("assignments").select("id")).data ?? []).length === 0);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
