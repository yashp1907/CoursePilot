import { SCALE_PRESETS, STANDARD_SCALE, type ScalePresetKey } from "./scales";
import { computeGrade } from "./calculations";
import type { GradeItem, GradeResult, GradeScaleEntry, GradingScheme } from "./types";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

export function scaleForCourse(course: Pick<Course, "grade_scale">, presetKey?: string | null): GradeScaleEntry[] {
  if (course.grade_scale && course.grade_scale.length) return course.grade_scale;
  const preset = SCALE_PRESETS[(presetKey ?? "standard") as ScalePresetKey];
  return preset ? [...preset.scale] : STANDARD_SCALE;
}

export function buildScheme(course: Course, categories: GradingCategoryRow[], presetKey?: string | null): GradingScheme {
  return {
    mode: course.grading_mode,
    categories: [...categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight), dropLowest: c.drop_lowest })),
    scale: scaleForCourse(course, presetKey),
    curve: Number(course.grade_curve) || 0,
  };
}

/** Only assignments with a point value can be graded. Study tasks are never graded. */
export function buildItems(assignments: Assignment[], grades: AssignmentGrade[]): GradeItem[] {
  const byAssignment = new Map(grades.map((g) => [g.assignment_id, g]));
  return assignments
    .filter((a) => a.points_possible !== null && a.type !== "study")
    .map((a) => {
      const g = byAssignment.get(a.id);
      return {
        id: a.id,
        categoryId: a.category_id,
        name: a.title,
        earned: g && g.points_earned !== null ? Number(g.points_earned) : null,
        possible: Number(a.points_possible),
        extraCredit: a.is_extra_credit,
        excused: g?.excused ?? false,
      };
    });
}

export function courseGrade(course: Course, categories: GradingCategoryRow[], assignments: Assignment[], grades: AssignmentGrade[], presetKey?: string | null): GradeResult {
  const scheme = buildScheme(course, categories, presetKey);
  const items = buildItems(assignments.filter((a) => a.course_id === course.id), grades);
  return computeGrade(scheme, items, "current");
}
