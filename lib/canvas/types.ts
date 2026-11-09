/** The subset of Canvas REST API fields CoursePilot uses (all optional: institutions vary). */
export interface CanvasCourse {
  id: number | string;
  name?: string | null;
  course_code?: string | null;
  workflow_state?: string;
  access_restricted_by_date?: boolean;
  apply_assignment_group_weights?: boolean;
  term?: { name?: string | null } | null;
  enrollments?: { type?: string; computed_current_score?: number | null; computed_current_grade?: string | null }[];
}

export interface CanvasSubmission {
  workflow_state?: string; // unsubmitted | submitted | graded | pending_review
  score?: number | null;
  grade?: string | null;
  excused?: boolean | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  missing?: boolean;
  late?: boolean;
}

export interface CanvasAssignment {
  id: number | string;
  name?: string | null;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  assignment_group_id?: number | null;
  submission_types?: string[];
  html_url?: string | null;
  published?: boolean;
  omit_from_final_grade?: boolean;
  submission?: CanvasSubmission | null;
}

export interface CanvasAssignmentGroup {
  id: number | string;
  name?: string | null;
  group_weight?: number | null;
  rules?: { drop_lowest?: number; drop_highest?: number; never_drop?: (number | string)[] } | null;
}

export interface CanvasAnnouncement {
  id: number | string;
  title?: string | null;
  message?: string | null;
  posted_at?: string | null;
  html_url?: string | null;
}
