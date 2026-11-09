export type AssignmentStatus = "not_started" | "in_progress" | "completed" | "submitted";
export type DisplayStatus = AssignmentStatus | "overdue";
export type Priority = "low" | "medium" | "high";
export type AssignmentType = "homework" | "quiz" | "exam" | "project" | "paper" | "lab" | "reading" | "presentation" | "study" | "other";
export type Source = "manual" | "syllabus" | "canvas" | "website";

export interface Profile {
  id: string;
  full_name: string | null;
  university: string | null;
  current_semester: string | null;
  grade_scale_preset: string;
}

export interface UserSettings {
  user_id: string;
  notify_deadlines: boolean;
  notify_overdue: boolean;
  notify_canvas: boolean;
  notify_exams: boolean;
  deadline_lead_hours: number;
  weekly_study_hours: number;
  availability: number[] | null;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  code: string | null;
  professor: string | null;
  professor_email: string | null;
  office_hours: string | null;
  classroom: string | null;
  semester: string | null;
  credits: number | null;
  description: string | null;
  color: string;
  canvas_course_id: string | null;
  grading_mode: "weighted" | "points";
  grade_scale: { letter: string; min: number }[] | null;
  grade_curve: number;
  settings: Record<string, unknown>;
  is_demo: boolean;
  archived: boolean;
  sort_order?: number;
  created_at: string;
}

export interface Syllabus {
  id: string;
  course_id: string;
  storage_path: string;
  file_name: string;
  status: "uploaded" | "extracting" | "extracted" | "failed" | "applied";
  extracted: unknown | null;
  error: string | null;
  model: string | null;
  applied_at: string | null;
  updated_at: string;
}

export interface GradingCategoryRow {
  id: string;
  course_id: string;
  name: string;
  weight: number;
  drop_lowest: number;
  sort_order: number;
}

export interface Assignment {
  id: string;
  user_id: string;
  course_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  type: AssignmentType;
  due_at: string | null;
  estimated_minutes: number | null;
  priority: Priority;
  status: AssignmentStatus;
  points_possible: number | null;
  is_extra_credit: boolean;
  source: Source;
  canvas_assignment_id: string | null;
  external_url: string | null;
  user_edited_fields: string[];
  is_demo: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface AssignmentGrade {
  id: string;
  assignment_id: string;
  points_earned: number | null;
  excused: boolean;
  graded_at?: string | null;
}

export interface CalendarEvent {
  id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  kind: "event" | "exam" | "holiday" | "milestone" | "study";
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  source: Source;
}

export interface ActivityEntry {
  id: string;
  course_id: string | null;
  kind: string;
  message: string;
  created_at: string;
}

export interface StudyTask {
  id: string;
  assignment_id: string | null;
  course_id: string | null;
  title: string;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  done: boolean;
  sort_order: number;
}
