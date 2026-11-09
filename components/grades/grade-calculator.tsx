"use client";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, FlaskConical, Pencil, Plus, RotateCcw, Save, Settings2, Target, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/states";
import { AssignmentDialog } from "@/components/assignments/assignment-dialog";
import { GradeFigure, KindBadge, fmtPct } from "./grade-badge";
import { buildItems, buildScheme } from "@/lib/grades/adapt";
import { applyScenario, computeGrade, gradeRange, projectGrade, remainingItems, requiredScore, round, validateScheme } from "@/lib/grades/calculations";
import { SCALE_PRESETS, type ScalePresetKey } from "@/lib/grades/scales";
import { saveGradingScheme } from "@/lib/actions/courses";
import { setAssignmentGrade } from "@/lib/actions/assignments";
import { run } from "@/lib/utils/action";
import type { GradeItem } from "@/lib/grades/types";
import type { Assignment, AssignmentGrade, Course, GradingCategoryRow } from "@/types/database";

interface Props { course: Course; categories: GradingCategoryRow[]; assignments: Assignment[]; grades: AssignmentGrade[]; presetKey: string }

export function GradeCalculator({ course, categories, assignments, grades, presetKey }: Props) {
  const scheme = useMemo(() => buildScheme(course, categories, presetKey), [course, categories, presetKey]);
  const items = useMemo(() => buildItems(assignments, grades), [assignments, grades]);
  const current = useMemo(() => computeGrade(scheme, items, "current"), [scheme, items]);
  const range = useMemo(() => gradeRange(scheme, items), [scheme, items]);
  const remaining = useMemo(() => remainingItems(scheme, items), [scheme, items]);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<"grades" | "whatif" | "target" | "scheme">(categories.length === 0 ? "scheme" : "grades");

  const nothingGraded = current.percent === null;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-6 pt-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <GradeFigure result={current} />
            <p className="mt-1 text-xs text-muted-foreground">
              {nothingGraded ? "Enter at least one grade below to see your current grade." :
                scheme.mode === "weighted" ? `Based on ${round(current.gradedWeight, 1)}% of the course weight that has been graded.` : `${current.earnedPoints} of ${current.possiblePoints} points earned so far.`}
            </p>
          </div>
          {!nothingGraded && remaining.length > 0 && (
            <div className="text-sm">
              <p className="text-xs font-medium text-muted-foreground">Still possible</p>
              <p>{fmtPct(range.min.percent, 1)} ({range.min.letter}) to {fmtPct(range.max.percent, 1)} ({range.max.letter})</p>
              <p className="text-xs text-muted-foreground">if remaining work scores 0% to 100%</p>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {scheme.curve !== 0 && <p>Includes a {scheme.curve > 0 ? "+" : ""}{scheme.curve}-point curve.</p>}
            <p>Letter scale: {course.grade_scale ? "custom" : SCALE_PRESETS[presetKey as ScalePresetKey]?.label ?? "standard"}</p>
          </div>
        </CardContent>
        {current.warnings.length > 0 && (
          <div className="mx-5 mb-5 flex gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-warning" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><ul className="space-y-0.5">{current.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}
      </Card>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1" role="tablist" aria-label="Grade tools">
        {([["grades", "Your grades", Pencil], ["whatif", "What-if", FlaskConical], ["target", "Target grade", Target], ["scheme", "Scheme", Settings2]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer ${tab === k ? "bg-primary-soft text-primary shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="size-4" />{label}</button>
        ))}
      </div>

      {tab === "scheme" && <SchemeEditor key={`${course.grading_mode}|${course.grade_curve}|${JSON.stringify(course.grade_scale)}|${categories.map((c) => `${c.id}:${c.name}:${c.weight}:${c.drop_lowest}`).join(",")}`} course={course} categories={categories} presetKey={presetKey} />}

      {tab === "grades" && <Card>
        <CardHeader>
          <div><CardTitle>Your grades</CardTitle><CardDescription>Enter scores as you get them. Leave blank if not graded yet: blank is never counted as zero.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><Plus /> Add graded item</Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState title="Nothing to grade yet" description="Add an assignment with a point value (here or from the Assignments page), then enter your score." action={<Button onClick={() => setAddOpen(true)}><Plus /> Add item</Button>} />
          ) : (
            <div className="space-y-5">
              {[...current.categories.map((c) => ({ id: c.id as string | null, name: c.name, weight: c.weight, percent: c.percent, dropped: c.droppedIds })),
                { id: null, name: "Uncategorized", weight: 0, percent: null, dropped: [] as string[] }]
                .map((cat) => {
                  const rows = items.filter((i) => (cat.id ? i.categoryId === cat.id : !i.categoryId || !categories.some((c) => c.id === i.categoryId)));
                  if (rows.length === 0) return null;
                  return (
                    <div key={cat.id ?? "none"}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-sm font-semibold">{cat.name}{scheme.mode === "weighted" && cat.id ? <span className="ml-2 font-normal text-muted-foreground">{cat.weight}% of grade</span> : null}</p>
                        <p className="text-xs text-muted-foreground">{cat.percent !== null ? `Average ${fmtPct(cat.percent)}` : "Not graded yet"}</p>
                      </div>
                      <ul className="divide-y rounded-md border">{rows.map((r) => <GradeRow key={r.id} item={r} dropped={cat.dropped.includes(r.id)} />)}</ul>
                      {!cat.id && scheme.mode === "weighted" && <p className="mt-1 text-xs text-muted-foreground">Uncategorized items aren&apos;t counted in weighted courses. Assign them a category in the assignment editor.</p>}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>}

      {tab === "whatif" && <WhatIf scheme={scheme} items={items} remaining={remaining} />}
      {tab === "target" && <TargetCalc scheme={scheme} items={items} remaining={remaining} />}

      <AssignmentDialog open={addOpen} onOpenChange={setAddOpen} courses={[course]} categories={categories} defaultCourseId={course.id} />
    </div>
  );
}

function GradeRow({ item, dropped }: { item: GradeItem; dropped: boolean }) {
  const [val, setVal] = useState(item.earned === null ? "" : String(item.earned));
  const [pending, start] = useTransition();
  const [prev, setPrev] = useState(item.earned);
  if (prev !== item.earned) { setPrev(item.earned); setVal(item.earned === null ? "" : String(item.earned)); }

  function commit() {
    const trimmed = val.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 0)) { toast.error("Enter a score of 0 or more."); setVal(item.earned === null ? "" : String(item.earned)); return; }
    if (next === item.earned) return;
    start(async () => { await run(setAssignmentGrade(item.id, next, !!item.excused)); });
  }
  function excuse(checked: boolean) {
    start(async () => { await run(setAssignmentGrade(item.id, item.earned, checked)); });
  }
  const pct = item.earned !== null && item.possible > 0 ? (item.earned / item.possible) * 100 : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span className="min-w-40 flex-1 truncate text-sm">{item.name}</span>
      {item.extraCredit && <Badge variant="primary">Extra credit</Badge>}
      {dropped && <Badge variant="warning">Dropped</Badge>}
      {item.excused && <Badge>Excused</Badge>}
      <div className="flex items-center gap-1.5">
        <Input aria-label={`Score for ${item.name}`} type="number" min="0" step="any" className="h-8 w-20" placeholder="–" value={val} disabled={pending}
          onChange={(e) => setVal(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <span className="text-sm text-muted-foreground">/ {item.possible}</span>
      </div>
      <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">{pct === null ? "" : fmtPct(pct, 1)}</span>
      <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={!!item.excused} onChange={(e) => excuse(e.target.checked)} className="accent-[var(--primary)]" /> Excused</label>
    </li>
  );
}

function SchemeEditor({ course, categories, presetKey }: { course: Course; categories: GradingCategoryRow[]; presetKey: string }) {
  const [pending, start] = useTransition();
  const make = () => ({
    mode: course.grading_mode, curve: String(course.grade_curve ?? 0),
    scale: course.grade_scale ? "custom" : "default",
    custom: (course.grade_scale ?? SCALE_PRESETS[presetKey as ScalePresetKey]?.scale ?? SCALE_PRESETS.standard.scale).map((s) => ({ ...s })),
    cats: categories.map((c) => ({ id: c.id as string | null, name: c.name, weight: String(c.weight), drop: String(c.drop_lowest) })),
  });
  const [d, setD] = useState(make);
  const open = true; // shown inside its own tab
  const total = d.cats.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const payload = () => ({
    mode: d.mode, curve: Number(d.curve) || 0,
    scale: d.scale === "custom" ? d.custom.map((s) => ({ letter: s.letter, min: Number(s.min) })) : d.scale === "default" ? null : [...SCALE_PRESETS[d.scale as ScalePresetKey].scale],
    categories: d.cats.map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight) || 0, drop_lowest: Math.max(0, Math.floor(Number(c.drop) || 0)) })),
  });
  const problems = validateScheme({ mode: d.mode, categories: d.cats.map((c) => ({ id: c.id ?? "", name: c.name || "Category", weight: Number(c.weight) || 0, dropLowest: Number(c.drop) || 0 })), scale: [], curve: 0 });

  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Grading scheme</CardTitle><CardDescription>{d.mode === "weighted" ? "Weighted categories" : "Total points"} · {categories.length} categories</CardDescription></div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Grading method</Label>
              <NativeSelect value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as "weighted" | "points" })}>
                <option value="weighted">Weighted categories</option><option value="points">Total points</option></NativeSelect></div>
            <div className="space-y-1.5"><Label>Curve (points added)</Label><Input type="number" step="any" value={d.curve} onChange={(e) => setD({ ...d, curve: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Letter scale</Label>
              <NativeSelect value={d.scale} onChange={(e) => setD({ ...d, scale: e.target.value })}>
                <option value="default">My default ({SCALE_PRESETS[presetKey as ScalePresetKey]?.label ?? "Standard"})</option>
                {Object.entries(SCALE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                <option value="custom">Custom…</option></NativeSelect></div>
          </div>
          {d.scale === "custom" && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Minimum percent for each letter, highest first.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {d.custom.map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input aria-label="Letter" className="h-8 w-14" value={s.letter} onChange={(e) => setD({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, letter: e.target.value } : x)) })} />
                    <Input aria-label="Minimum percent" type="number" step="any" className="h-8 w-16" value={s.min} onChange={(e) => setD({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />
                    <button aria-label="Remove letter" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setD({ ...d, custom: d.custom.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setD({ ...d, custom: [...d.custom, { letter: "", min: 0 }] })}><Plus /> Add letter</Button>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Categories {d.mode === "points" && <span className="font-normal text-muted-foreground">(optional: used for dropping lowest scores)</span>}</Label>
              {d.mode === "weighted" && <span className={Math.abs(total - 100) > 0.01 ? "text-xs font-medium text-warning" : "text-xs font-medium text-success"}>Total {round(total, 2)}%</span>}
            </div>
            {d.cats.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Category name" className="min-w-40 flex-1" placeholder="Homework" value={c.name} onChange={(e) => setD({ ...d, cats: d.cats.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                {d.mode === "weighted" && <div className="flex items-center gap-1"><Input aria-label="Weight percent" type="number" min="0" max="100" step="any" className="w-20" value={c.weight} onChange={(e) => setD({ ...d, cats: d.cats.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} /><span className="text-sm text-muted-foreground">%</span></div>}
                <div className="flex items-center gap-1"><Input aria-label="Lowest scores dropped" type="number" min="0" className="w-16" value={c.drop} onChange={(e) => setD({ ...d, cats: d.cats.map((x, j) => (j === i ? { ...x, drop: e.target.value } : x)) })} /><span className="text-xs text-muted-foreground">dropped</span></div>
                <Button variant="ghost" size="icon" aria-label="Remove category" onClick={() => setD({ ...d, cats: d.cats.filter((_, j) => j !== i) })}><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setD({ ...d, cats: [...d.cats, { id: null, name: "", weight: "0", drop: "0" }] })}><Plus /> Add category</Button>
          </div>
          {problems.length > 0 && <ul className="text-xs text-warning">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setD(make())}><RotateCcw /> Reset</Button>
            <Button loading={pending} onClick={() => start(async () => { await run(saveGradingScheme(course.id, payload() as never), "Grading scheme saved"); })}><Save /> Save scheme</Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function WhatIf({ scheme, items, remaining }: { scheme: ReturnType<typeof buildScheme>; items: GradeItem[]; remaining: GradeItem[] }) {
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [fill, setFill] = useState<Record<string, string>>({});
  const [assume, setAssume] = useState("85");
  const current = useMemo(() => computeGrade(scheme, items, "current"), [scheme, items]);

  // Every assignment, grouped by category. Categories with weight but no items get a virtual placeholder row.
  const groups = useMemo(() => {
    const placeholders = remaining.filter((r) => r.id.startsWith("placeholder:"));
    const base = scheme.categories.map((c) => ({
      id: c.id as string | null, name: c.name, weight: c.weight,
      rows: [...items.filter((i) => i.categoryId === c.id), ...placeholders.filter((p) => p.categoryId === c.id)],
    }));
    const known = new Set(scheme.categories.map((c) => c.id));
    const loose = items.filter((i) => !i.categoryId || !known.has(i.categoryId));
    if (loose.length) base.push({ id: null, name: "Uncategorized", weight: 0, rows: loose });
    return base.filter((g) => g.rows.length > 0);
  }, [scheme.categories, items, remaining]);

  const parse = (raw: string | undefined) => {
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const hyp = useMemo(() => {
    const scores: Record<string, number> = {};
    const virtual: GradeItem[] = [];
    let used = 0;
    for (const g of groups) for (const r of g.rows) {
      const n = parse(pcts[r.id]);
      if (n === null) continue;
      used++;
      const pts = (r.possible * n) / 100;
      if (r.id.startsWith("placeholder:")) virtual.push({ ...r, earned: pts }); else scores[r.id] = pts;
    }
    return { used, result: computeGrade(scheme, [...applyScenario(items, scores), ...virtual], "hypothetical") };
  }, [pcts, groups, items, scheme]);

  const proj = useMemo(() => {
    const n = Number(assume);
    return Number.isFinite(n) && n >= 0 ? projectGrade(scheme, items, n) : null;
  }, [assume, scheme, items]);

  const catNow = new Map(current.categories.map((c) => [c.id, c]));
  const catHyp = new Map(hyp.result.categories.map((c) => [c.id, c]));
  const delta = hyp.result.percent !== null && current.percent !== null ? hyp.result.percent - current.percent : null;

  if (groups.length === 0) {
    return <Card><CardHeader><div><CardTitle>What-if scenarios</CardTitle><CardDescription>Add assignments with point values (or grading categories) to experiment with scenarios.</CardDescription></div></CardHeader></Card>;
  }

  const set = (id: string, v: string) => setPcts((p) => ({ ...p, [id]: v }));
  const fillCategory = (gid: string, rows: GradeItem[]) => {
    const n = parse(fill[gid]);
    if (n === null) { toast.error("Enter a percentage first."); return; }
    setPcts((p) => { const next = { ...p }; for (const r of rows) if (r.earned === null && !r.excused) next[r.id] = String(n); return next; });
  };

  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4" /> What-if scenarios</CardTitle>
        <CardDescription>Every assignment is listed by category. Type a percentage on any item, even one already graded, or fill a whole category at once. Nothing here is saved to your real grades.</CardDescription></div></CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_17rem]">
        <div className="space-y-4">
          {groups.map((g) => {
            const gid = g.id ?? "none";
            const now = g.id ? catNow.get(g.id) : undefined;
            const hy = g.id ? catHyp.get(g.id) : undefined;
            const ungraded = g.rows.filter((r) => r.earned === null && !r.excused);
            const changed = hy && now && (hy.percent ?? null) !== (now.percent ?? null);
            return (
              <section key={gid} className="rounded-md border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{g.name}{g.id && scheme.mode === "weighted" && <span className="ml-2 font-normal text-muted-foreground">{g.weight}% of grade</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {now ? <>Now {now.percent === null ? "no grades yet" : fmtPct(now.percent, 1)}{changed && <> → <span className="font-medium text-foreground">what-if {fmtPct(hy!.percent, 1)}</span></>}</> : null}
                      {" · "}{g.rows.filter((r) => r.earned !== null).length} graded, {ungraded.length} to go
                    </p>
                  </div>
                  {ungraded.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Set all ungraded to</span>
                      <Input aria-label={`Fill ungraded ${g.name} with percent`} type="number" min="0" step="any" className="h-7 w-16" placeholder="%" value={fill[gid] ?? ""} onChange={(e) => setFill((f) => ({ ...f, [gid]: e.target.value }))} />
                      <Button size="sm" variant="outline" onClick={() => fillCategory(gid, g.rows)}>Apply</Button>
                    </div>
                  )}
                </header>
                <ul className="divide-y">
                  {g.rows.map((r) => {
                    const virtual = r.id.startsWith("placeholder:");
                    const graded = r.earned !== null;
                    const curPct = graded && r.possible > 0 ? (r.earned! / r.possible) * 100 : null;
                    const overridden = parse(pcts[r.id]) !== null;
                    return (
                      <li key={r.id} className={"flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 " + (overridden ? "bg-primary-soft/40" : "")}>
                        <div className="min-w-40 flex-1">
                          <p className="truncate text-sm">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {virtual ? "Nothing added yet. Your what-if stands in for it." : graded ? `Graded: ${r.earned}/${r.possible}${curPct !== null ? ` (${fmtPct(curPct, 1)})` : ""}` : `Not graded · ${r.possible} pts`}
                            {r.extraCredit ? " · extra credit" : ""}{r.excused ? " · excused" : ""}
                          </p>
                        </div>
                        {!r.excused && (
                          <div className="flex items-center gap-1">
                            <Input aria-label={`What-if percent for ${r.name}`} type="number" min="0" step="any" className="h-8 w-20" placeholder={graded && curPct !== null ? fmtPct(curPct, 0).replace("%", "") : "%"} value={pcts[r.id] ?? ""} onChange={(e) => set(r.id, e.target.value)} />
                            <span className="text-sm text-muted-foreground">%</span>
                            {overridden && <button aria-label={`Clear what-if for ${r.name}`} className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setPcts((p) => { const n = { ...p }; delete n[r.id]; return n; })}><X className="size-3.5" /></button>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border bg-muted/40 p-4">
            {hyp.used === 0 ? <><KindBadge kind="hypothetical" /><p className="mt-2 text-sm text-muted-foreground">Enter a percentage on one or more items to see your grade change instantly.</p>
              <p className="mt-2 text-xs text-muted-foreground">Now: {fmtPct(current.percent)} {current.letter}</p></> : (
              <><GradeFigure result={hyp.result} size="md" />
                {delta !== null && <p className={"mt-1 text-sm font-medium " + (delta >= 0 ? "text-success" : "text-destructive")}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)} pts vs current ({fmtPct(current.percent)} {current.letter})</p>}
                <p className="mt-1 text-xs text-muted-foreground">{hyp.used} what-if score{hyp.used === 1 ? "" : "s"}. Any ungraded item you leave blank isn&apos;t counted.</p>
                <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => { setPcts({}); setFill({}); }}><RotateCcw /> Clear all</Button></>)}
          </div>
          <div className="rounded-lg border p-4">
            <KindBadge kind="projected" />
            <label className="mt-2 block text-sm text-muted-foreground">If I average this on everything left:<span className="mt-1.5 flex items-center gap-1.5"><Input aria-label="Assumed percent on remaining work" type="number" min="0" step="any" className="h-9 w-20" value={assume} onChange={(e) => setAssume(e.target.value)} /><span className="font-medium text-foreground">%</span></span></label>
            {proj && <p className="mt-2 text-2xl font-semibold">{fmtPct(proj.percent)} <span className="text-base text-primary">{proj.letter}</span></p>}
            <p className="mt-1 text-xs text-muted-foreground">Same score on all {remaining.length} ungraded item{remaining.length === 1 ? "" : "s"}{remaining.some((r) => r.id.startsWith("placeholder:")) ? ", including categories with nothing added yet" : ""}.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TargetCalc({ scheme, items, remaining }: { scheme: ReturnType<typeof buildScheme>; items: GradeItem[]; remaining: GradeItem[] }) {
  const letters = useMemo(() => [...scheme.scale].sort((a, b) => b.min - a.min), [scheme.scale]);
  const [target, setTarget] = useState<string>(() => String(letters.find((l) => l.letter.startsWith("A") && !l.letter.includes("+"))?.min ?? 90));
  const [scope, setScope] = useState("all");
  const [others, setOthers] = useState("");

  const result = useMemo(() => {
    const t = Number(target);
    if (!Number.isFinite(t)) return null;
    return requiredScore(scheme, items, t, scope === "all" ? {} : { itemIds: [scope], othersPercent: others === "" ? null : Number(others) });
  }, [scheme, items, target, scope, others]);

  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Target className="size-4" /> Target grade</CardTitle>
        <CardDescription>What do you need on the remaining work to reach a goal?</CardDescription></div></CardHeader>
      <CardContent className="space-y-4">
        {remaining.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is left to be graded, so there is no remaining work to target.</p> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>I want to finish with</Label>
                <NativeSelect value={letters.some((l) => String(l.min) === target) ? target : "custom"} onChange={(e) => e.target.value !== "custom" && setTarget(e.target.value)}>
                  {letters.filter((l) => l.min > 0).map((l) => <option key={l.letter} value={l.min}>{l.letter} (≥ {l.min}%)</option>)}
                  <option value="custom">Custom percent…</option></NativeSelect></div>
              <div className="space-y-1.5"><Label>Target percent</Label><Input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Apply to</Label>
                <NativeSelect value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="all">All remaining work equally</option>
                  {remaining.map((r) => <option key={r.id} value={r.id}>Only: {r.name}</option>)}</NativeSelect></div>
            </div>
            {scope !== "all" && remaining.length > 1 && (
              <div className="flex items-center gap-2 text-sm">Assume
                <Input aria-label="Assumed percent on other remaining work" type="number" min="0" step="any" className="h-8 w-20" placeholder="–" value={others} onChange={(e) => setOthers(e.target.value)} />
                % on the other remaining items <span className="text-xs text-muted-foreground">(blank = leave them out)</span></div>
            )}
            {result && (
              <div className="rounded-lg border bg-muted/40 p-4">
                {result.requiredPercent === null ? <p className="text-sm">{result.reason}</p> : result.alreadySecured ? (
                  <p className="text-sm"><span className="font-semibold text-success">Already secured.</span> You&apos;d reach {fmtPct(result.targetPercent)} even with 0% on the remaining work.</p>
                ) : (
                  <>
                    <p className="text-2xl font-semibold">{fmtPct(result.requiredPercent, 1)} <span className="text-sm font-normal text-muted-foreground">needed on the remaining work</span></p>
                    {!result.achievable && <p className="mt-1 text-sm text-destructive">{result.reason}</p>}
                    {result.requiredPointsPerItem.length <= 6 && (
                      <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">{result.requiredPointsPerItem.map((p) => <li key={p.id}>{p.name}: about {round(p.points, 1)} of {p.possible} pts</li>)}</ul>
                    )}
                  </>
                )}
                <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Assumptions</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
