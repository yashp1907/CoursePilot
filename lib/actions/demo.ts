"use server";

import { revalidatePath } from "next/cache";
import { authed, fail, type ActionResult } from "./helpers";
import { nextCourseOrder } from "@/lib/data/queries";

const day = (n: number, hour = 23, min = 59) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(hour, min, 0, 0);
  return d.toISOString();
};

interface DemoAssignment { t: string; type: string; due: number; pts: number | null; cat: string | null; got?: number; status?: string; pri?: string; mins?: number }
interface DemoCourse {
  code: string; name: string; prof: string; color: string; credits: number; mode: "weighted" | "points";
  cats: { name: string; w: number; drop?: number }[]; a: DemoAssignment[];
}

const COURSES: DemoCourse[] = [
  {
    code: "IOE 310", name: "Introduction to Optimization Methods", prof: "Demo Instructor A", color: "blue", credits: 4, mode: "weighted",
    cats: [{ name: "Homework", w: 20, drop: 1 }, { name: "Quizzes", w: 10 }, { name: "Midterm", w: 40 }, { name: "Final Exam", w: 30 }],
    a: [
      { t: "Homework 1", type: "homework", due: -40, pts: 100, cat: "Homework", got: 95, status: "completed" },
      { t: "Homework 2", type: "homework", due: -26, pts: 100, cat: "Homework", got: 72, status: "completed" },
      { t: "Homework 3", type: "homework", due: -12, pts: 100, cat: "Homework", got: 88, status: "completed" },
      { t: "Quiz 1", type: "quiz", due: -30, pts: 20, cat: "Quizzes", got: 17, status: "completed" },
      { t: "Midterm Exam", type: "exam", due: -8, pts: 100, cat: "Midterm", got: 84, status: "completed" },
      { t: "Homework 4", type: "homework", due: 2, pts: 100, cat: "Homework", pri: "high", mins: 180, status: "in_progress" },
      { t: "Quiz 2", type: "quiz", due: 6, pts: 20, cat: "Quizzes", mins: 45 },
      { t: "Final Exam", type: "exam", due: 38, pts: 100, cat: "Final Exam", pri: "high", mins: 600 },
    ],
  },
  {
    code: "IOE 333", name: "Quality Engineering Methods", prof: "Demo Instructor B", color: "teal", credits: 3, mode: "weighted",
    cats: [{ name: "Labs", w: 30 }, { name: "Project", w: 30 }, { name: "Exams", w: 40 }],
    a: [
      { t: "Lab 1: Control Charts", type: "lab", due: -21, pts: 50, cat: "Labs", got: 46, status: "submitted" },
      { t: "Lab 2: Capability Analysis", type: "lab", due: -7, pts: 50, cat: "Labs", got: 41, status: "submitted" },
      { t: "Lab 3: Acceptance Sampling", type: "lab", due: 4, pts: 50, cat: "Labs", mins: 120 },
      { t: "Project Proposal", type: "project", due: 9, pts: 30, cat: "Project", mins: 150 },
      { t: "Exam 1", type: "exam", due: 12, pts: 100, cat: "Exams", pri: "high", mins: 360 },
    ],
  },
  {
    code: "EECS 280", name: "Programming and Introductory Data Structures", prof: "Demo Instructor C", color: "violet", credits: 4, mode: "points",
    cats: [{ name: "Projects", w: 0 }, { name: "Exams", w: 0 }],
    a: [
      { t: "Project 1: Image Processing", type: "project", due: -35, pts: 100, cat: "Projects", got: 98, status: "completed" },
      { t: "Project 2: Card Game", type: "project", due: -14, pts: 100, cat: "Projects", got: 91, status: "completed" },
      { t: "Project 3: Text Classifier", type: "project", due: 5, pts: 100, cat: "Projects", pri: "high", mins: 600, status: "in_progress" },
      { t: "Midterm", type: "exam", due: -10, pts: 150, cat: "Exams", got: 118, status: "completed" },
      { t: "Final Exam", type: "exam", due: 40, pts: 200, cat: "Exams", pri: "high", mins: 720 },
    ],
  },
  {
    code: "IOE 373", name: "Operations Research Models", prof: "Demo Instructor D", color: "amber", credits: 3, mode: "weighted",
    cats: [{ name: "Problem Sets", w: 25 }, { name: "Midterms", w: 40 }, { name: "Final", w: 35 }],
    a: [
      { t: "Problem Set 1", type: "homework", due: -18, pts: 40, cat: "Problem Sets", got: 36, status: "completed" },
      { t: "Problem Set 2", type: "homework", due: -4, pts: 40, cat: "Problem Sets", status: "not_started", pri: "high" },
      { t: "Problem Set 3", type: "homework", due: 8, pts: 40, cat: "Problem Sets", mins: 150 },
      { t: "Midterm 1", type: "exam", due: 11, pts: 100, cat: "Midterms", pri: "high", mins: 420 },
    ],
  },
];

/** Replace any existing demo data with a fresh, clearly-labeled demo workspace. */
export async function loadDemoData(): Promise<ActionResult<{ courses: number }>> {
  try {
    const { supabase, user } = await authed();
    await supabase.from("courses").delete().eq("is_demo", true);
    await supabase.from("calendar_events").delete().eq("is_demo", true);

    let order = await nextCourseOrder();
    for (const c of COURSES) {
      const { data: course, error } = await supabase.from("courses").insert({
        user_id: user.id, name: c.name, code: c.code, professor: c.prof, color: c.color, credits: c.credits, grading_mode: c.mode,
        ...(order !== null ? { sort_order: order++ } : {}), semester: "Demo semester", description: "DEMO DATA: sample course for exploring CoursePilot. Not real Canvas or grade data.", is_demo: true,
      }).select("id").single();
      if (error || !course) return { ok: false, error: error?.message ?? "Couldn't create demo course." };

      const { data: cats, error: ce } = await supabase.from("grading_categories").insert(
        c.cats.map((k, i) => ({ user_id: user.id, course_id: course.id, name: k.name, weight: k.w, drop_lowest: k.drop ?? 0, sort_order: i })),
      ).select("id, name");
      if (ce) return { ok: false, error: ce.message };
      const catId = new Map((cats ?? []).map((k) => [k.name as string, k.id as string]));

      const { data: rows, error: ae } = await supabase.from("assignments").insert(
        c.a.map((a) => ({
          user_id: user.id, course_id: course.id, category_id: a.cat ? catId.get(a.cat) ?? null : null, title: a.t, type: a.type,
          due_at: day(a.due), points_possible: a.pts, priority: a.pri ?? "medium", status: a.status ?? "not_started",
          estimated_minutes: a.mins ?? null, source: "manual", is_demo: true,
          completed_at: a.status === "completed" || a.status === "submitted" ? day(a.due - 1) : null,
        })),
      ).select("id, title");
      if (ae) return { ok: false, error: ae.message };
      const byTitle = new Map((rows ?? []).map((r) => [r.title as string, r.id as string]));
      const grades = c.a.filter((a) => a.got !== undefined).map((a) => ({
        user_id: user.id, assignment_id: byTitle.get(a.t)!, points_earned: a.got!, graded_at: day(a.due + 2), source: "manual",
      }));
      if (grades.length) {
        const { error: ge } = await supabase.from("assignment_grades").insert(grades);
        if (ge) return { ok: false, error: ge.message };
      }
    }
    await supabase.from("calendar_events").insert([
      { user_id: user.id, title: "Demo: Study group", kind: "study", starts_at: day(1, 22, 0), all_day: false, is_demo: true },
      { user_id: user.id, title: "Demo: Fall break", kind: "holiday", starts_at: day(20, 5, 0), all_day: true, is_demo: true },
    ]);
    await supabase.from("activity_log").insert({ user_id: user.id, kind: "demo_loaded", message: "Loaded demo data (sample courses, not real data)" });
    revalidatePath("/", "layout");
    return { ok: true, data: { courses: COURSES.length } };
  } catch (e) { return fail(e); }
}

export async function resetDemoData(): Promise<ActionResult> {
  try {
    const { supabase } = await authed();
    const a = await supabase.from("courses").delete().eq("is_demo", true);
    const b = await supabase.from("calendar_events").delete().eq("is_demo", true);
    if (a.error || b.error) return { ok: false, error: (a.error ?? b.error)!.message };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) { return fail(e); }
}
