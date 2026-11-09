import { Badge } from "@/components/ui/badge";
import type { GradeKind, GradeResult } from "@/lib/grades/types";

export const fmtPct = (n: number | null | undefined, places = 2) => (n === null || n === undefined ? "–" : `${n.toFixed(places).replace(/\.?0+$/, "")}%`);

const KIND = {
  current: { label: "Current grade", variant: "primary", help: "Based only on graded work. Ungraded work is not counted as zero." },
  projected: { label: "Projected grade", variant: "warning", help: "An estimate that assumes a score on all remaining work." },
  hypothetical: { label: "Hypothetical grade", variant: "outline", help: "A what-if scenario you created. Not saved." },
} as const;

export function KindBadge({ kind }: { kind: GradeKind }) {
  const k = KIND[kind];
  return <Badge variant={k.variant} title={k.help}>{k.label}</Badge>;
}

export function GradeFigure({ result, size = "lg" }: { result: GradeResult; size?: "md" | "lg" }) {
  return (
    <div>
      <KindBadge kind={result.kind} />
      <div className="mt-2 flex items-baseline gap-2">
        <span className={size === "lg" ? "text-4xl font-semibold tracking-tight" : "text-2xl font-semibold tracking-tight"}>{result.percent === null ? "–" : fmtPct(result.percent)}</span>
        {result.letter && <span className={size === "lg" ? "text-xl font-medium text-primary" : "text-base font-medium text-primary"}>{result.letter}</span>}
      </div>
    </div>
  );
}
