"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { courseHex } from "@/lib/utils/colors";

export interface TrendSeries { courseId: string; label: string; color: string; points: { label: string; percent: number; date: string }[] }
export interface PerfRow { label: string; percent: number | null; letter: string | null; color?: string }
export interface CompletionRow { label: string; completed: number; open: number; overdue: number }
export interface WeekRow { label: string; hours: number; exams: number; items: number; busy: boolean }

const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const GRID = "var(--border)";

function Tip({ active, payload, render }: { active?: boolean; payload?: { payload: unknown }[]; render: (p: never) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md">{render(payload[0].payload as never)}</div>;
}

/** One small chart per course: color follows the course, a single series needs no legend (title names it). */
export function TrendChart({ s }: { s: TrendSeries }) {
  const color = courseHex(s.color);
  const data = s.points.map((p, i) => ({ ...p, n: i + 1 }));
  return (
    <div role="img" aria-label={`${s.label} grade trend: ${data.map((d) => `${d.label} ${d.percent}%`).join(", ")}`} className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis domain={[(m: number) => Math.max(0, Math.floor((m - 5) / 5) * 5), (m: number) => Math.min(110, Math.ceil((m + 5) / 5) * 5)]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <Tooltip content={<Tip render={((p: { label: string; percent: number }) => <><p className="font-medium">{p.label}</p><p className="text-muted-foreground">Course grade after this: {p.percent}%</p></>) as never} />} />
          <Line type="monotone" dataKey="percent" stroke={color} strokeWidth={2} dot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: color }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Magnitude of one measure across courses: a single hue, with the value labeled on the bar. */
export function PerformanceChart({ rows }: { rows: PerfRow[] }) {
  const data = rows.filter((r) => r.percent !== null).map((r) => ({ ...r, percent: Math.round((r.percent as number) * 10) / 10 }));
  return (
    <div role="img" aria-label={`Current grade by course: ${data.map((d) => `${d.label} ${d.percent}%`).join(", ")}`} style={{ height: Math.max(120, data.length * 44 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 8 }} barCategoryGap={10}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={72} />
          <Tooltip cursor={{ fill: "var(--accent)" }} content={<Tip render={((p: PerfRow) => <><p className="font-medium">{p.label}</p><p className="text-muted-foreground">{p.percent}% · {p.letter}</p></>) as never} />} />
          <Bar dataKey="percent" fill="var(--primary)" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "var(--foreground)", formatter: (v: unknown) => `${v}%` }}>{data.map((d) => <Cell key={d.label} fill={courseHex(d.color)} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SEG = [
  { key: "completed", label: "Done", color: "var(--primary)" },
  { key: "open", label: "To do", color: "var(--input)" },
  { key: "overdue", label: "Overdue", color: "var(--destructive)" },
] as const;

/** Part-to-whole per course: 3 segments, legend always shown (identity is not color-alone), 2px surface gaps. */
export function CompletionChart({ rows }: { rows: CompletionRow[] }) {
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        {SEG.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
      </ul>
      <div role="img" aria-label={`Assignment status by course: ${rows.map((r) => `${r.label} ${r.completed} done, ${r.open} to do, ${r.overdue} overdue`).join("; ")}`} style={{ height: Math.max(120, rows.length * 44 + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={10}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={72} />
            <Tooltip cursor={{ fill: "var(--accent)" }} content={<Tip render={((p: CompletionRow) => <><p className="font-medium">{p.label}</p><p className="text-muted-foreground">{p.completed} done · {p.open} to do · {p.overdue} overdue</p></>) as never} />} />
            {SEG.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={2} radius={i === SEG.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function WorkloadChart({ rows }: { rows: WeekRow[] }) {
  return (
    <div role="img" aria-label={`Estimated work hours by week: ${rows.map((r) => `${r.label} ${r.hours}h`).join(", ")}`} className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="h" />
          <Tooltip cursor={{ fill: "var(--accent)" }} content={<Tip render={((p: WeekRow) => <><p className="font-medium">{p.label}</p><p className="text-muted-foreground">{p.items} due ({p.exams} exam{p.exams === 1 ? "" : "s"}) · ~{p.hours}h</p>{p.busy && <p className="text-warning">Busy week</p>}</>) as never} />} />
          <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
