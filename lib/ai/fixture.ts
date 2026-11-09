import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";
import type { AssistantSnapshot } from "./assistant-tools";
import { EMPTY_EXTRACTION } from "./schemas";
import { courseInfoSchema } from "@/lib/course-info/schemas";

/** A small fictional student used by tests and `npm run test:assistant`. */
export function fixtureSnapshot(now = new Date("2026-11-09T15:00:00Z")): AssistantSnapshot {
  const h = (n: number) => new Date(+now + n * 3_600_000).toISOString();
  const course = (id: string, code: string, name: string, credits: number, mode: "weighted" | "points" = "weighted"): Course => ({
    id, user_id: "u", name, code, professor: "Dr. Demo", professor_email: null, office_hours: null, classroom: null, semester: "Fall 2026", credits,
    description: null, color: "blue", canvas_course_id: null, grading_mode: mode, grade_scale: null, grade_curve: 0, settings: {}, is_demo: false, archived: false, created_at: "",
  });
  const cat = (id: string, course_id: string, name: string, weight: number, drop = 0): GradingCategoryRow => ({ id, course_id, name, weight, drop_lowest: drop, sort_order: 0 });
  const a = (o: Partial<Assignment> & { id: string; course_id: string; title: string }): Assignment => ({
    user_id: "u", category_id: null, description: null, type: "homework", due_at: null, estimated_minutes: null, priority: "medium", status: "not_started", points_possible: 100,
    is_extra_credit: false, source: "manual", canvas_assignment_id: null, external_url: null, user_edited_fields: [], is_demo: false, completed_at: null, created_at: "2026-10-01T00:00:00Z", ...o,
  });
  const g = (assignment_id: string, pts: number): AssignmentGrade => ({ id: assignment_id, assignment_id, points_earned: pts, excused: false });
  return {
    now, timeZone: "America/Detroit", presetKey: "standard", focusCourseId: null, weeklyStudyHours: 15,
    courses: [course("c310", "IOE 310", "Introduction to Optimization", 4), course("c280", "EECS 280", "Programming and Data Structures", 4, "points")],
    categories: [cat("hw", "c310", "Homework", 20, 1), cat("qz", "c310", "Quizzes", 10), cat("mt", "c310", "Midterm", 40), cat("fn", "c310", "Final Exam", 30)],
    assignments: [
      a({ id: "h1", course_id: "c310", category_id: "hw", title: "Homework 1", due_at: h(-500), status: "completed" }),
      a({ id: "h2", course_id: "c310", category_id: "hw", title: "Homework 2", due_at: h(-300), status: "completed" }),
      a({ id: "h3", course_id: "c310", category_id: "hw", title: "Homework 3", due_at: h(-100), status: "completed" }),
      a({ id: "h4", course_id: "c310", category_id: "hw", title: "Homework 4", due_at: h(30), priority: "high", source: "canvas", created_at: h(-24) }),
      a({ id: "q1", course_id: "c310", category_id: "qz", title: "Quiz 1", due_at: h(-400), points_possible: 20, status: "completed" }),
      a({ id: "mid", course_id: "c310", category_id: "mt", title: "Midterm", type: "exam", due_at: h(-200), status: "completed" }),
      a({ id: "fin", course_id: "c310", category_id: "fn", title: "Final Exam", type: "exam", due_at: h(24 * 35), priority: "high" }),
      a({ id: "p3", course_id: "c280", title: "Project 3", type: "project", due_at: h(24 * 3), points_possible: 100 }),
      a({ id: "e280", course_id: "c280", title: "Midterm Exam", type: "exam", due_at: h(-250), points_possible: 150, status: "completed" }),
      a({ id: "late", course_id: "c280", title: "Lab 5", type: "lab", due_at: h(-30), points_possible: 50 }),
    ],
    grades: [g("h1", 95), g("h2", 72), g("h3", 88), g("q1", 17), g("mid", 84), g("e280", 118)],
    syllabi: [{ course_id: "c310", file_name: "ioe310.pdf", status: "applied", extracted: { ...EMPTY_EXTRACTION, policies: { ...EMPTY_EXTRACTION.policies, late_submission: "10% penalty per day, up to 3 days.", drop_policy: "Lowest homework dropped." } } }],
    history: [{ assignment_id: "h4", field: "due_at", old_value: h(6), new_value: h(30), created_at: h(-20) }],
    courseInfo: [{ course_id: "c310", modules: [{ name: "Week 1: Linear programming", items: ["Lecture 1", "HW 1"] }], info: courseInfoSchema.parse({
      summary: "Introduction to optimization methods.",
      meetings: [{ kind: "lecture", title: "Lecture", days: "Mon/Wed", start_time: "10:30", end_time: "12:00", location: "1571 GGBL" }, { kind: "lab", days: "Fri", start_time: "14:00", end_time: "15:00", location: "EECS 1311", section: "003" }, { kind: "office_hours", days: "Tue", start_time: "14:00", end_time: "15:00", person: "Dr. Rivera", location: "BBB 3601" }],
      people: [{ name: "Dr. Maria Rivera", role: "instructor", email: "rivera@example.edu", office_hours: "Tue 2-3pm", location: "BBB 3601", source: "canvas" }, { name: "Sam Lee", role: "ta", title: "GSI", email: "samlee@example.edu", office_hours: "Thu 4-5pm", source: "canvas" }, { name: "Pat Kim", role: "ia", title: "IA", email: "patkim@example.edu", source: "canvas" }],
      contacts: [{ label: "Course email", type: "email", value: "ioe310-staff@example.edu" }, { label: "Ed Discussion", type: "forum", value: "https://edstem.org/us/courses/555" }],
      links: [{ label: "Gradescope", url: "https://www.gradescope.com/courses/777", kind: "gradescope" }],
      key_info: [{ label: "Prerequisites", value: "MATH 215" }], policies: { late: "10% per day, up to 3 days" },
    }) }],
    announcements: [], lastSync: { status: "success", finished_at: h(-2) },
  };
}
