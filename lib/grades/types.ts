export type GradingMode = "weighted" | "points";

export interface GradeCategory {
  id: string;
  name: string;
  /** Percent of the course grade (0-100). Ignored in points mode. */
  weight: number;
  /** Number of lowest-scoring items to drop in this category. */
  dropLowest: number;
}

export interface GradeItem {
  id: string;
  categoryId: string | null;
  name: string;
  /** null = not graded yet (never treated as zero). */
  earned: number | null;
  possible: number;
  /** Extra-credit items add to earned points but not to possible points. */
  extraCredit?: boolean;
  /** Excused items are ignored entirely. */
  excused?: boolean;
}

export interface GradeScaleEntry {
  letter: string;
  /** Minimum percent (inclusive) for this letter. */
  min: number;
}

export interface GradingScheme {
  mode: GradingMode;
  categories: GradeCategory[];
  scale: GradeScaleEntry[];
  /** Flat percentage points added to the final percent. */
  curve: number;
}

export interface CategoryResult {
  id: string;
  name: string;
  weight: number;
  earned: number;
  possible: number;
  /** null when nothing in the category has been graded. */
  percent: number | null;
  droppedIds: string[];
  gradedCount: number;
  totalCount: number;
  /** Points contributed to the overall percent (weighted mode), renormalized over graded weight. */
  contribution: number | null;
}

/** Which kind of number this is. Always show this label in the UI. */
export type GradeKind = "current" | "projected" | "hypothetical";

export interface GradeResult {
  kind: GradeKind;
  mode: GradingMode;
  /** Final percent including curve; null if nothing is graded. */
  percent: number | null;
  /** Percent before curve. */
  rawPercent: number | null;
  letter: string | null;
  categories: CategoryResult[];
  /** Sum of weights of categories that have at least one graded item. */
  gradedWeight: number;
  totalWeight: number;
  earnedPoints: number;
  possiblePoints: number;
  /** Number of graded (non-excused) items across all buckets. */
  gradedCount: number;
  warnings: string[];
}

export interface TargetResult {
  targetPercent: number;
  /** Uniform percent needed on the remaining items; null if it cannot be determined. */
  requiredPercent: number | null;
  /** True if the target is already guaranteed even with 0% on remaining items. */
  alreadySecured: boolean;
  /** False if the target needs more than 100% on remaining work. */
  achievable: boolean;
  remainingItems: GradeItem[];
  /** Points needed per remaining item at the required percent. */
  requiredPointsPerItem: { id: string; name: string; points: number; possible: number }[];
  assumptions: string[];
  reason?: string;
}
