/** 4.0-scale GPA points by letter (plus/minus). Deterministic; never AI-computed. */
export const GPA_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0, E: 0,
};

export interface GpaCourse { credits: number | null; letter: string | null }

/** Credit-weighted GPA over courses that have both credits and a letter. Returns null with no usable course. */
export function computeGpa(courses: GpaCourse[], points: Record<string, number> = GPA_POINTS): { gpa: number; credits: number; counted: number } | null {
  let qp = 0, cr = 0, n = 0;
  for (const c of courses) {
    if (c.credits === null || c.credits <= 0 || !c.letter || !(c.letter in points)) continue;
    qp += points[c.letter] * c.credits; cr += c.credits; n++;
  }
  return cr > 0 ? { gpa: qp / cr, credits: cr, counted: n } : null;
}
