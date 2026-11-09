/** Convert a wall-clock date/time in an IANA timezone to a UTC ISO string (DST-aware). */
function offsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export function zonedToUtcIso(date: string, time: string | null, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "23:59").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let tzName = tz;
  try { Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tzName = "UTC"; }
  let utc = guess - offsetMs(guess, tzName);
  utc = guess - offsetMs(utc, tzName);
  return new Date(utc).toISOString();
}
