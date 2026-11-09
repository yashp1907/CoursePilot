import type { GradeScaleEntry } from "./types";

const mk = (pairs: [string, number][]): GradeScaleEntry[] => pairs.map(([letter, min]) => ({ letter, min }));

export const STANDARD_SCALE = mk([
  ["A", 93], ["A-", 90], ["B+", 87], ["B", 83], ["B-", 80], ["C+", 77], ["C", 73], ["C-", 70], ["D+", 67], ["D", 63], ["D-", 60], ["F", 0],
]);

export const STRAIGHT_SCALE = mk([["A", 90], ["B", 80], ["C", 70], ["D", 60], ["F", 0]]);

/** Common plus/minus scale with an A+ tier. Instructors set their own cutoffs: check your syllabus. */
export const PLUS_MINUS_A_PLUS_SCALE = mk([
  ["A+", 97], ["A", 93], ["A-", 90], ["B+", 87], ["B", 83], ["B-", 80], ["C+", 77], ["C", 73], ["C-", 70], ["D+", 67], ["D", 63], ["D-", 60], ["E", 0],
]);

export const SCALE_PRESETS = {
  standard: { label: "Standard +/- (A = 93)", scale: STANDARD_SCALE },
  straight: { label: "Straight (A = 90)", scale: STRAIGHT_SCALE },
  plus_minus_a_plus: { label: "+/- with A+ (A+ = 97)", scale: PLUS_MINUS_A_PLUS_SCALE },
} as const;

export type ScalePresetKey = keyof typeof SCALE_PRESETS;
