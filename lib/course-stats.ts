import { courseGrade } from "@/lib/grades/adapt";
import { displayStatus } from "@/lib/utils/dates";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";
import type { GradeResult } from "@/lib/grades/types";

export interface CourseSummary {
  course: Course;
  grade: GradeResult;
  total: number;
  done: number;
  overdue: number;
  next: Assignment | null;
}

export function summarizeCourses(courses: Course[], categories: GradingCategoryRow[], assignments: Assignment[], grades: AssignmentGrade[], presetKey: string | null, now = new Date()): CourseSummary[] {
  return courses.map((course) => {
    const mine = assignments.filter((a) => a.course_id === course.id);
    const cats = categories.filter((c) => c.course_id === course.id);
    const open = mine.filter((a) => a.status !== "completed" && a.status !== "submitted");
    const upcoming = open.filter((a) => a.due_at && new Date(a.due_at) >= now).sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
    return {
      course, grade: courseGrade(course, cats, mine, grades, presetKey), total: mine.length,
      done: mine.length - open.length, overdue: mine.filter((a) => displayStatus(a, now) === "overdue").length, next: upcoming[0] ?? null,
    };
  });
}
