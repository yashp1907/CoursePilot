/**
 * Deterministic grade engine. No AI is ever involved in these numbers.
 *
 * Definitions
 *  - Current grade:      only graded items count; ungraded items are NOT zeros.
 *  - Projected grade:    ungraded items are filled with an assumed percent.
 *  - Hypothetical grade: the student overrides specific scores.
 */
import { STANDARD_SCALE } from "./scales";
import type {
  CategoryResult, GradeCategory, GradeItem, GradeKind, GradeResult, GradeScaleEntry, GradingScheme, TargetResult,
} from "./types";

const EPS = 1e-9;
const UNCATEGORIZED = "__uncategorized__";

export function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function letterForPercent(percent: number | null, scale: GradeScaleEntry[] = STANDARD_SCALE): string | null {
  if (percent === null || Number.isNaN(percent)) return null;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const s of sorted) if (percent + EPS >= s.min) return s.letter;
  return sorted.length ? sorted[sorted.length - 1].letter : null;
}

interface BucketStats {
  earned: number;
  possible: number;
  percent: number | null;
  droppedIds: string[];
  gradedCount: number;
  totalCount: number;
}

/** Stats for one group of items, applying drop-lowest, extra credit, excused and ungraded rules. */
export function bucketStats(items: GradeItem[], dropLowest = 0): BucketStats {
  const live = items.filter((i) => !i.excused);
  const graded = live.filter((i) => i.earned !== null && Number.isFinite(i.earned));
  const isEc = (i: GradeItem) => !!i.extraCredit || i.possible <= 0;
  const regular = graded.filter((i) => !isEc(i));
  const extra = graded.filter(isEc);

  // Never drop everything: at least one regular item must remain.
  const dropCount = Math.max(0, Math.min(Math.floor(dropLowest), regular.length - 1));
  const droppedIds: string[] = [];
  let kept = regular;
  if (dropCount > 0) {
    const ranked = regular
      .map((item, idx) => ({ item, idx, pct: (item.earned as number) / item.possible }))
      .sort((a, b) => a.pct - b.pct || a.idx - b.idx);
    const drop = new Set(ranked.slice(0, dropCount).map((r) => r.item.id));
    droppedIds.push(...drop);
    kept = regular.filter((i) => !drop.has(i.id));
  }

  const earned = kept.reduce((s, i) => s + (i.earned as number), 0) + extra.reduce((s, i) => s + (i.earned as number), 0);
  const possible = kept.reduce((s, i) => s + i.possible, 0);
  const percent = possible > 0 ? (earned / possible) * 100 : null;
  return { earned, possible, percent, droppedIds, gradedCount: graded.length, totalCount: live.length };
}

export function computeGrade(scheme: GradingScheme, items: GradeItem[], kind: GradeKind = "current"): GradeResult {
  const warnings: string[] = [];
  const byCat = new Map<string, GradeItem[]>();
  for (const it of items) {
    const key = it.categoryId && scheme.categories.some((c) => c.id === it.categoryId) ? it.categoryId : UNCATEGORIZED;
    (byCat.get(key) ?? byCat.set(key, []).get(key)!).push(it);
  }

  const totalWeight = scheme.categories.reduce((s, c) => s + c.weight, 0);
  const catResults: CategoryResult[] = scheme.categories.map((c: GradeCategory) => {
    const st = bucketStats(byCat.get(c.id) ?? [], c.dropLowest);
    return { id: c.id, name: c.name, weight: c.weight, ...st, contribution: null };
  });

  let rawPercent: number | null = null;
  let gradedWeight = 0;
  let earnedPoints = 0;
  let possiblePoints = 0;
  let gradedCount = 0;

  if (scheme.mode === "weighted") {
    const uncategorized = byCat.get(UNCATEGORIZED) ?? [];
    if (uncategorized.some((i) => i.earned !== null && !i.excused)) {
      warnings.push("Some graded items have no category and are not counted in a weighted course.");
    }
    if (scheme.categories.length === 0) warnings.push("Add grading categories to calculate a weighted grade.");
    else if (Math.abs(totalWeight - 100) > 0.01) warnings.push(`Category weights add up to ${round(totalWeight)}%, not 100%.`);
    const active = catResults.filter((c) => c.percent !== null && c.weight > 0);
    gradedWeight = active.reduce((s, c) => s + c.weight, 0);
    if (gradedWeight > 0) {
      for (const c of active) c.contribution = ((c.percent as number) * c.weight) / gradedWeight;
      rawPercent = active.reduce((s, c) => s + (c.contribution as number), 0);
    }
    for (const c of catResults) { earnedPoints += c.earned; possiblePoints += c.possible; gradedCount += c.gradedCount; }
  } else {
    const buckets: BucketStats[] = catResults.map((c) => c);
    const unc = bucketStats(byCat.get(UNCATEGORIZED) ?? [], 0);
    buckets.push(unc);
    earnedPoints = buckets.reduce((s, b) => s + b.earned, 0);
    possiblePoints = buckets.reduce((s, b) => s + b.possible, 0);
    gradedCount = buckets.reduce((s, b) => s + b.gradedCount, 0);
    rawPercent = possiblePoints > 0 ? (earnedPoints / possiblePoints) * 100 : null;
  }

  const percent = rawPercent === null ? null : rawPercent + (scheme.curve || 0);
  return {
    kind, mode: scheme.mode, percent, rawPercent, letter: letterForPercent(percent, scheme.scale),
    categories: catResults, gradedWeight, totalWeight, earnedPoints, possiblePoints, gradedCount, warnings,
  };
}

/** Hypothetical: override earned points for specific item ids (e.g. a not-yet-graded final). */
export function applyScenario(items: GradeItem[], scores: Record<string, number | null>): GradeItem[] {
  return items.map((it) => (it.id in scores ? { ...it, earned: scores[it.id] } : it));
}

/** Convert a percent into points for an item. */
export function pointsFromPercent(item: Pick<GradeItem, "possible">, percent: number): number {
  return (item.possible * percent) / 100;
}

/**
 * Items that are not yet graded. In weighted mode, categories with weight but no items
 * get a virtual 100-point placeholder (e.g. a "Final Exam" category before the exam exists).
 */
export function remainingItems(scheme: GradingScheme, items: GradeItem[]): GradeItem[] {
  const rem = items.filter((i) => i.earned === null && !i.excused);
  if (scheme.mode === "weighted") {
    for (const c of scheme.categories) {
      if (c.weight > 0 && !items.some((i) => i.categoryId === c.id && !i.excused)) {
        rem.push({ id: `placeholder:${c.id}`, categoryId: c.id, name: `${c.name} (not yet added)`, earned: null, possible: 100 });
      }
    }
  }
  return rem;
}

/** Projected grade: every ungraded item is assumed to score `assumedPercent`. */
export function projectGrade(scheme: GradingScheme, items: GradeItem[], assumedPercent: number): GradeResult {
  const rem = remainingItems(scheme, items);
  const filled = [
    ...items.map((it) => (it.earned === null && !it.excused ? { ...it, earned: pointsFromPercent(it, assumedPercent) } : it)),
    ...rem.filter((r) => r.id.startsWith("placeholder:")).map((r) => ({ ...r, earned: pointsFromPercent(r, assumedPercent) })),
  ];
  return computeGrade(scheme, filled, "projected");
}

export interface TargetOptions {
  /** Restrict the "needed" score to these items (others use `othersPercent`). */
  itemIds?: string[];
  /** Percent assumed on remaining items not in `itemIds`. null = they are left out of the calculation. */
  othersPercent?: number | null;
}

/** What uniform percent is needed on the remaining items to hit `targetPercent`? Bisection on a monotone function. */
export function requiredScore(scheme: GradingScheme, items: GradeItem[], targetPercent: number, opts: TargetOptions = {}): TargetResult {
  const allRemaining = remainingItems(scheme, items);
  const focus = opts.itemIds ? allRemaining.filter((r) => opts.itemIds!.includes(r.id)) : allRemaining;
  const others = allRemaining.filter((r) => !focus.some((f) => f.id === r.id));
  const othersPct = opts.othersPercent ?? null;

  const assumptions: string[] = [
    "Already-graded work keeps its current score.",
    scheme.curve ? `A ${scheme.curve > 0 ? "+" : ""}${scheme.curve}-point curve is applied.` : "No curve is applied.",
  ];
  const base: TargetResult = {
    targetPercent, requiredPercent: null, alreadySecured: false, achievable: false,
    remainingItems: focus, requiredPointsPerItem: [], assumptions,
  };
  if (focus.length === 0) return { ...base, reason: "There is no remaining graded work to apply the target to." };

  assumptions.push(`The same percentage is assumed on ${focus.length === 1 ? "the selected item" : `all ${focus.length} remaining items`}.`);
  assumptions.push(
    others.length === 0 ? "" : othersPct === null
      ? `${others.length} other ungraded item(s) are left out of the calculation.`
      : `${others.length} other ungraded item(s) are assumed at ${round(othersPct, 1)}%.`,
  );
  base.assumptions = assumptions.filter(Boolean);

  const evalAt = (p: number): number | null => {
    const scores: Record<string, number> = {};
    for (const f of focus) scores[f.id] = pointsFromPercent(f, p);
    if (othersPct !== null) for (const o of others) scores[o.id] = pointsFromPercent(o, othersPct);
    const real = applyScenario(items, scores);
    const phs = [...focus, ...(othersPct !== null ? others : [])]
      .filter((r) => r.id.startsWith("placeholder:"))
      .map((r) => ({ ...r, earned: scores[r.id] }));
    return computeGrade(scheme, [...real, ...phs]).percent;
  };

  const f0 = evalAt(0);
  if (f0 !== null && f0 + EPS >= targetPercent) {
    return { ...base, requiredPercent: 0, alreadySecured: true, achievable: true, requiredPointsPerItem: focus.map((f) => ({ id: f.id, name: f.name, points: 0, possible: f.possible })) };
  }
  const HI = 1000;
  const fHi = evalAt(HI);
  if (fHi === null || fHi + EPS < targetPercent) {
    return { ...base, reason: "This target cannot be reached with the remaining work, even with extra credit." };
  }
  let lo = 0, hi = HI;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = evalAt(mid);
    if (v !== null && v + EPS >= targetPercent) hi = mid; else lo = mid;
  }
  const req = hi;
  return {
    ...base,
    requiredPercent: req,
    achievable: req <= 100 + 1e-6,
    requiredPointsPerItem: focus.map((f) => ({ id: f.id, name: f.name, points: pointsFromPercent(f, req), possible: f.possible })),
    reason: req > 100 + 1e-6 ? "This needs more than 100% on the remaining work, so it is only possible with extra credit." : undefined,
  };
}

/** Highest/lowest letter outcomes if remaining work scores 0% or 100%. Useful for "what's still possible". */
export function gradeRange(scheme: GradingScheme, items: GradeItem[]): { min: GradeResult; max: GradeResult } {
  return { min: projectGrade(scheme, items, 0), max: projectGrade(scheme, items, 100) };
}

export function validateScheme(scheme: GradingScheme): string[] {
  const errs: string[] = [];
  if (scheme.mode === "weighted") {
    const total = scheme.categories.reduce((s, c) => s + c.weight, 0);
    if (scheme.categories.length === 0) errs.push("Add at least one category.");
    else if (Math.abs(total - 100) > 0.01) errs.push(`Weights total ${round(total)}%; they should total 100%.`);
  }
  for (const c of scheme.categories) {
    if (c.weight < 0) errs.push(`${c.name}: weight cannot be negative.`);
    if (c.dropLowest < 0) errs.push(`${c.name}: dropped count cannot be negative.`);
  }
  return errs;
}
