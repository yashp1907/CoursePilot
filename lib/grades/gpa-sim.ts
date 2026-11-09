import { GPA_POINTS } from "./gpa";

export interface GpaScalePreset { label: string; points: Record<string, number>; note?: string }

/** Letter -> points scales. The Michigan preset is only used when the student selects it. */
export const GPA_SCALES: Record<string, GpaScalePreset> = {
  umich: {
    label: "University of Michigan (4.0, +/-)",
    points: { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, E: 0 },
    note: "Michigan's published letter-grade points. Instructors choose their own percentage cutoffs.",
  },
  standard: { label: "Standard 4.0 (+/-)", points: { ...GPA_POINTS } },
  straight: { label: "Straight 4.0 (no +/-)", points: { A: 4, B: 3, C: 2, D: 1, F: 0 } },
};

export interface SimCourse { id: string; name: string; credits: number; letter: string | null }

export interface SimResult {
  semesterGpa: number | null;
  semesterCredits: number;
  cumulativeGpa: number | null;
  cumulativeCredits: number;
  skipped: string[];
}

/**
 * Hypothetical semester + cumulative GPA. Credits-weighted; courses without credits or a letter on this
 * scale are skipped (and reported) rather than guessed. Current GPA/credits are optional.
 */
export function simulateGpa(courses: SimCourse[], points: Record<string, number>, current?: { gpa: number | null; credits: number }): SimResult {
  let qp = 0, cr = 0;
  const skipped: string[] = [];
  for (const c of courses) {
    if (!(c.credits > 0) || !c.letter || !(c.letter in points)) { skipped.push(c.name || "Unnamed course"); continue; }
    qp += points[c.letter] * c.credits; cr += c.credits;
  }
  const semesterGpa = cr > 0 ? qp / cr : null;
  const curCr = current && current.gpa !== null && current.credits > 0 ? current.credits : 0;
  const cumCr = curCr + cr;
  const cumulativeGpa = cumCr > 0 && (cr > 0 || curCr > 0) ? ((current?.gpa ?? 0) * curCr + qp) / cumCr : null;
  return { semesterGpa, semesterCredits: cr, cumulativeGpa, cumulativeCredits: cumCr, skipped };
}
