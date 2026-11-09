/**
 * Deterministic "are these the same assignment?" logic shared by Canvas sync, syllabus import and the
 * duplicate finder. Matches by meaning (kind + number + wording + date), never by exact text, and refuses
 * near-misses like Homework 4 vs Homework 5.
 */
export interface Matchable { title: string; type?: string | null; due_at?: string | null; points?: number | null }

export type Kind = "homework" | "quiz" | "midterm" | "final" | "exam" | "lab" | "project" | "paper" | "presentation" | "reading" | "discussion" | null;

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

function clean(title: string): string {
  return title.toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")       // hw4 -> hw 4
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/mid[-\s]?term/g, "midterm")
    .replace(/[^a-z0-9/.\-– ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function kindOf(title: string, type?: string | null): Kind {
  const t = clean(title);
  const final2 = t.match(/\bfinal\s+(project|paper|presentation|report)\b/);
  if (final2) return final2[1] === "report" ? "paper" : (final2[1] as Kind);
  if (/\bmidterm\b/.test(t)) return "midterm";
  if (/\bfinal(\s+exam(ination)?)?\b/.test(t)) return "final";
  if (/\b(exam|examination|test)\b/.test(t)) return "exam";
  if (/\bquiz(zes)?\b/.test(t)) return "quiz";
  if (/\b(lab|laboratory)\b/.test(t)) return "lab";
  if (/\b(project|proj)\b/.test(t)) return "project";
  if (/\b(paper|essay)\b/.test(t)) return "paper";
  if (/\b(presentation|slides)\b/.test(t)) return "presentation";
  if (/\b(homework|hw|problem sets?|pset|worksheet)\b/.test(t)) return "homework";
  if (/\breading\b/.test(t)) return "reading";
  if (/\bdiscussion\b/.test(t)) return "discussion";
  // No kind word in the title: fall back to the assignment's type.
  const byType: Record<string, Kind> = { homework: "homework", quiz: "quiz", exam: "exam", lab: "lab", project: "project", paper: "paper", presentation: "presentation", reading: "reading" };
  return (type && byType[type]) || null;
}

/** The sequence number in a title ("Homework 04" -> 4, "Quiz two" -> 2, "Exam 1" -> 1). Ignores dates, chapters, weeks, years, percents. */
export function numberOf(title: string): number | null {
  const t = clean(title)
    .replace(/\b\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?\b/g, " ")              // dates
    .replace(/\b(chapters?|ch|sections?|sec|weeks?|wk|pages?|pp?|lectures?|lec|module|modules|units?)\b\.?\s*[\d\s,\-–&and]+/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")                                      // years
    .replace(/\b\d+\s*%/g, " ").replace(/\b\d+\s*(points?|pts)\b/g, " ");
  const m = t.match(/\b(\d{1,2})\b/);
  if (m) return parseInt(m[1], 10);
  for (const w of t.split(" ")) if (w in WORD_NUMBERS) return WORD_NUMBERS[w];
  return null;
}

const STOP = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "due", "assignment", "assignments", "chapter", "part", "online", "submission", "submit", "written", "report", "set", "sets", "problem", "exam", "examination", "test", "midterm", "final", "quiz", "lab", "laboratory", "project", "proj", "paper", "essay", "presentation", "reading", "discussion", "homework", "hw", "pset", "worksheet", "no", "number"]);

export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("zzes")) return w.slice(0, -3);
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function contentWords(title: string): Set<string> {
  return new Set(clean(title).replace(/[0-9/.\-–]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map(stem));
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 1;
  let i = 0; for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};

const EXAM_FAMILY = new Set<Kind>(["midterm", "exam"]);
function kindsCompatible(a: Kind, b: Kind): boolean {
  if (a === null || b === null) return a === b; // one side has no clear kind: don't guess
  return a === b || (EXAM_FAMILY.has(a) && EXAM_FAMILY.has(b));
}

export interface MatchScore { score: number; reasons: string[] }

export function matchScore(a: Matchable, b: Matchable): MatchScore {
  const ka = kindOf(a.title, a.type), kb = kindOf(b.title, b.type);
  if (!kindsCompatible(ka, kb)) return { score: 0, reasons: ["different kinds of work"] };
  const na = numberOf(a.title), nb = numberOf(b.title);
  if (na !== null && nb !== null && na !== nb) return { score: 0, reasons: [`different numbers (${na} vs ${nb})`] };

  const ca = contentWords(a.title), cb = contentWords(b.title);
  const jac = jaccard(ca, cb);
  const shared = [...ca].filter((x) => cb.has(x)).length;
  const reasons: string[] = [];
  let s: number;
  const singleton = ka === "midterm" || ka === "final" || kb === "midterm" || kb === "final"; // usually one per course
  if (na !== null && nb !== null) { s = 0.9; reasons.push(`both are ${ka ?? "item"} ${na}`); if (jac >= 0.5) s += 0.05; }
  else if (na === null && nb === null) {
    if (clean(a.title) === clean(b.title)) { s = 0.97; reasons.push("same title"); }
    else if (singleton) { s = 0.85; reasons.push(`the ${ka === "exam" ? kb : ka}`); }
    else if (jac >= 0.8) { s = 0.88; reasons.push("nearly identical wording"); }
    else if (jac >= 0.5 || (ka !== null && shared >= 1)) { s = 0.74; reasons.push("similar wording"); }
    else s = 0.5;
  } else {
    if (singleton) { s = 0.82; reasons.push(`the ${ka === "exam" ? kb : ka}`); }
    else if (shared >= 1 || jac >= 0.5) { s = 0.76; reasons.push("shared wording"); }
    else s = 0.45;
  }

  if (a.due_at && b.due_at) {
    const hours = Math.abs(+new Date(a.due_at) - +new Date(b.due_at)) / 3_600_000;
    if (hours <= 48) { s += 0.05; reasons.push("due about the same time"); }
    // Far-apart dates only count against look-alikes with no number to tell them apart. A midterm/final (one per
    // course) or a matching "Homework 4" is the same item even if the syllabus date was tentative.
    else if (hours > 24 * 45 && !singleton && (na === null || nb === null)) { s -= 0.1; reasons.push("due dates far apart"); }
  }
  if (a.points != null && b.points != null && a.points > 0 && b.points > 0 && Math.abs(a.points - b.points) / Math.max(a.points, b.points) > 0.5) s -= 0.05;
  return { score: Math.max(0, Math.min(1, s)), reasons };
}

export const LINK_THRESHOLD = 0.8;
/** Items the student created by hand are only linked on a (near-)certain match. */
export const MANUAL_THRESHOLD = 0.9;

/**
 * Greedy one-to-one matching: best pairs first, each item used at most once. A candidate whose top two
 * matches are tied (and indistinguishable by date) is left unmatched rather than guessed.
 */
export function matchOneToOne(candidates: Matchable[], pool: Matchable[], thresholdFor: (poolIndex: number) => number = () => LINK_THRESHOLD): Map<number, { index: number; score: number; reasons: string[] }> {
  const pairs: { c: number; p: number; score: number; reasons: string[]; dist: number }[] = [];
  for (let c = 0; c < candidates.length; c++) {
    const scored: typeof pairs = [];
    for (let p = 0; p < pool.length; p++) {
      const m = matchScore(candidates[c], pool[p]);
      if (m.score >= thresholdFor(p)) {
        const d = candidates[c].due_at && pool[p].due_at ? Math.abs(+new Date(candidates[c].due_at!) - +new Date(pool[p].due_at!)) : Infinity;
        scored.push({ c, p, score: m.score, reasons: m.reasons, dist: d });
      }
    }
    scored.sort((x, y) => y.score - x.score || x.dist - y.dist);
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.02 && scored[0].dist === scored[1].dist) continue; // ambiguous
    pairs.push(...scored);
  }
  pairs.sort((x, y) => y.score - x.score || x.dist - y.dist);
  const out = new Map<number, { index: number; score: number; reasons: string[] }>();
  const used = new Set<number>();
  for (const pr of pairs) {
    if (out.has(pr.c) || used.has(pr.p)) continue;
    out.set(pr.c, { index: pr.p, score: pr.score, reasons: pr.reasons });
    used.add(pr.p);
  }
  return out;
}

/** "Weekly quizzes", or a syllabus entry that describes a recurring pattern instead of one dated item. */
export function isRecurringPlaceholder(a: { title: string; description?: string | null; due_at?: string | null }): boolean {
  if (a.description && /^recurring:/i.test(a.description)) return true;
  return !a.due_at && /\b(weekly|biweekly|daily|each|every|ongoing|periodic)\b/i.test(a.title) && numberOf(a.title) === null;
}

/** Canvas items already cover a recurring placeholder when 2+ of the same kind exist. */
export function coveredByItems(placeholder: { title: string; type?: string | null }, items: Matchable[], minCount = 2): boolean {
  const k = kindOf(placeholder.title, placeholder.type);
  if (!k) return false;
  return items.filter((i) => kindsCompatible(k, kindOf(i.title, i.type))).length >= minCount;
}

/** Do two grading-category names mean the same thing? ("Homework" ~ "Homework Assignments", "Quizzes" ~ "Quiz") */
export function categoryNamesMatch(a: string, b: string): boolean {
  const SYN: Record<string, string> = { assignment: "homework", hw: "homework", pset: "homework", worksheet: "homework" };
  const tokens = (s: string) => new Set(clean(s).replace(/[0-9/.\-–]+/g, " ").split(" ").filter((w) => w.length > 1 && !["the", "and", "of", "a", "an", "graded", "total"].includes(w)).map((w) => { const st = stem(w); return SYN[st] ?? st; }));
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return [...small].every((x) => big.has(x));
}
