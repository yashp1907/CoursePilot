/**
 * End-to-end check of the core data journey against a REAL Supabase project (RLS included):
 * sign up -> create course -> grading categories -> assignments -> grades -> current grade -> hypothetical final -> isolation.
 *
 *   npm run e2e
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, and the migration applied.
 * Disable "Confirm email" in Supabase Auth settings for the test project, or this cannot create users.
 * Creates throwaway users (e2e-*@example.com) and deletes the courses it makes.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyScenario, computeGrade, requiredScore } from "../lib/grades/calculations";
import { buildItems, buildScheme } from "../lib/grades/adapt";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "../types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`); if (!ok) failures++; };

async function newUser(tag: string): Promise<{ sb: SupabaseClient; id: string }> {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const email = `e2e-${tag}-${Date.now()}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: "Passw0rd!e2e", options: { data: { full_name: `E2E ${tag}` } } });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message}. Is "Confirm email" disabled?`);
  if (!data.session) throw new Error("No session returned: disable email confirmation for the test project.");
  return { sb, id: data.user.id };
}

async function main() {
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  const a = await newUser("a");
  const b = await newUser("b");

  const profile = await a.sb.from("profiles").select("full_name").eq("id", a.id).single();
  check("signup trigger created profile", profile.data?.full_name === "E2E a");

  const course = (await a.sb.from("courses").insert({ user_id: a.id, name: "E2E Course", code: "E2E 101", credits: 4 }).select("*").single()).data as Course;
  check("course created", !!course?.id);

  const cats = (await a.sb.from("grading_categories").insert([
    { user_id: a.id, course_id: course.id, name: "Homework", weight: 20, sort_order: 0 }, { user_id: a.id, course_id: course.id, name: "Midterm", weight: 40, sort_order: 1 },
    { user_id: a.id, course_id: course.id, name: "Final", weight: 40, sort_order: 2 },
  ]).select("*")).data as GradingCategoryRow[];
  const id = (n: string) => cats.find((c) => c.name === n)!.id;
  const asg = (await a.sb.from("assignments").insert([
    { user_id: a.id, course_id: course.id, category_id: id("Homework"), title: "HW1", type: "homework", points_possible: 100, due_at: new Date(Date.now() - 864e5).toISOString() },
    { user_id: a.id, course_id: course.id, category_id: id("Midterm"), title: "Midterm", type: "exam", points_possible: 100, due_at: null },
    { user_id: a.id, course_id: course.id, category_id: id("Final"), title: "Final", type: "exam", points_possible: 100, due_at: new Date(Date.now() + 30 * 864e5).toISOString() },
  ]).select("*")).data as Assignment[];
  check("assignments created", asg.length === 3);

  const hw = asg.find((x) => x.title === "HW1")!, mid = asg.find((x) => x.title === "Midterm")!, fin = asg.find((x) => x.title === "Final")!;
  const g = await a.sb.from("assignment_grades").upsert([
    { user_id: a.id, assignment_id: hw.id, points_earned: 90 }, { user_id: a.id, assignment_id: mid.id, points_earned: 80 },
  ], { onConflict: "assignment_id" });
  check("grades saved", !g.error, g.error?.message);

  const grades = (await a.sb.from("assignment_grades").select("*")).data as AssignmentGrade[];
  const scheme = buildScheme(course, cats, "standard");
  const items = buildItems(asg, grades);
  const current = computeGrade(scheme, items);
  // (20*90 + 40*80) / 60 = 83.33
  check("current grade = 83.33%", Math.abs((current.percent ?? 0) - 83.3333) < 0.01, String(current.percent));
  const hyp = computeGrade(scheme, applyScenario(items, { [fin.id]: 95 }), "hypothetical");
  // .2*90 + .4*80 + .4*95 = 18+32+38 = 88
  check("hypothetical 95% final = 88%", Math.abs((hyp.percent ?? 0) - 88) < 0.01, String(hyp.percent));
  const need = requiredScore(scheme, items, 90);
  // 50 so far; need 40 from .4*x => 100
  check("needs 100% on final for A-", Math.abs((need.requiredPercent ?? 0) - 100) < 0.01, String(need.requiredPercent));

  // Isolation
  const seen = await b.sb.from("courses").select("id");
  check("user B cannot see user A's courses", (seen.data ?? []).length === 0);
  const spoof = await b.sb.from("assignments").insert({ user_id: b.id, course_id: course.id, title: "x" });
  check("user B cannot add to user A's course", !!spoof.error);
  await b.sb.from("courses").update({ name: "hacked" }).eq("id", course.id);
  check("user B cannot modify user A's course", (await a.sb.from("courses").select("name").eq("id", course.id).single()).data?.name === "E2E Course");

  await a.sb.from("courses").delete().eq("id", course.id);
  check("cascade delete removed assignments", ((await a.sb.from("assignments").select("id")).data ?? []).length === 0);
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
