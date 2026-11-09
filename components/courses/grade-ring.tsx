import { courseHex } from "@/lib/utils/colors";

/** Circular grade indicator: arc length = current percent (capped at 100), letter in the middle. */
export function GradeRing({ percent, letter, color, size = 64 }: { percent: number | null; letter: string | null; color: string; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const pct = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const hex = courseHex(color);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={percent === null ? "No grades yet" : `Current grade ${letter ?? ""} (${percent.toFixed(1)} percent)`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="6" strokeDasharray={percent === null ? "3 5" : undefined} />
        {percent !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={hex} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[17px] font-semibold tracking-tight">{percent === null ? "–" : letter ?? "–"}</span>
        {percent !== null && <span className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground">{percent.toFixed(percent >= 99.95 || percent < 10 ? 0 : 1)}%</span>}
      </div>
    </div>
  );
}
