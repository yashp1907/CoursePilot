const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function weekdayIndex(text: string | null | undefined): number | null {
  const m = (text ?? "").trim().toLowerCase().match(/^(sun|mon|tue|wed|thu|fri|sat)/);
  return m ? DAYS.indexOf(m[1]) : null;
}

const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
const validDate = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d, 12)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/**
 * Course sites print "Fri Sep 18" with no year. The model infers a year; the weekday it copied from the page
 * is a deterministic check: a given month/day falls on that weekday in only some years. Correct the year when
 * a neighboring year matches; flag the item when none does.
 */
export function fixYearByWeekday(isoDate: string, weekday: string | null | undefined): { date: string; status: "ok" | "fixed" | "mismatch" | "unchecked" } {
  const want = weekdayIndex(weekday);
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (want === null || !m) return { date: isoDate, status: "unchecked" };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (validDate(y, mo, d) && dow(y, mo, d) === want) return { date: isoDate, status: "ok" };
  for (const dy of [-1, 1]) {   // only the neighboring years: a wrong weekday must not teleport a date further

    if (validDate(y + dy, mo, d) && dow(y + dy, mo, d) === want) return { date: `${y + dy}-${m[2]}-${m[3]}`, status: "fixed" };
  }
  return { date: isoDate, status: "mismatch" };
}
