import type { SyllabusExtraction } from "@/lib/ai/schemas";
import { safeHttpsUrl } from "@/lib/canvas/map";
import { fixYearByWeekday } from "./dates";

const DAY = 86_400_000;

/**
 * Deterministic checks on what the model returned: verify each year against the printed weekday,
 * make links absolute https, drop untitled/duplicate rows, and warn about anything that looks off.
 */
export function postProcessWebsiteExtraction(ex: SyllabusExtraction, opts: { today: Date; baseUrl: string; crawlWarnings?: string[] }): SyllabusExtraction {
  const out: SyllabusExtraction = structuredClone(ex);
  const warnings = [...(opts.crawlWarnings ?? []), ...out.warnings];
  let fixed = 0;

  const check = (title: string, date: string | null, weekday: string | null): string | null => {
    if (!date) return null;
    const r = fixYearByWeekday(date, weekday);
    if (r.status === "fixed") fixed++;
    if (r.status === "mismatch") { warnings.push(`"${title}": the date ${date} doesn't fall on a ${weekday}. Please check it.`); }
    const t = Date.parse(`${r.date}T12:00:00Z`);
    if (Math.abs(t - +opts.today) > 400 * DAY) { warnings.push(`"${title}": ${r.date} is more than a year from today. Check the year.`); }
    return r.date;
  };

  // Category names should be plain ("Projects"), without trailing details like "(P1=4%, P2=8%)".
  const cleanCat = (n: string | null) => (n ? n.replace(/\s*[([].*$/, "").replace(/\s+/g, " ").trim() || n.trim() : n);
  out.grading.categories = out.grading.categories.map((c) => ({ ...c, name: cleanCat(c.name) ?? c.name }));
  const seen = new Set<string>();
  out.assignments = out.assignments.filter((a) => a.title.trim().length > 0).map((a) => ({
    ...a, category: cleanCat(a.category), title: a.title.trim(), due_date: check(a.title, a.due_date, a.weekday), url: safeHttpsUrl(a.url ? new URL(a.url, opts.baseUrl).toString() : null),
    basis: a.basis,
  })).filter((a) => { const k = `${a.title.toLowerCase()}|${a.due_date}`; if (seen.has(k)) return false; seen.add(k); return true; });
  out.important_dates = out.important_dates.filter((d) => d.title.trim().length > 0).map((d) => ({
    ...d, title: d.title.trim(), date: check(d.title, d.date, d.weekday),
    end_date: d.end_date,
  }));
  if (fixed) warnings.push(`Corrected the year on ${fixed} date${fixed === 1 ? "" : "s"} using the weekday printed on the site.`);
  if (out.assignments.length === 0) warnings.push("No assignments or deadlines were found on these pages. Try the link to the schedule page directly.");
  out.warnings = Array.from(new Set(warnings));
  return out;
}
