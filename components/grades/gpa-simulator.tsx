"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { GPA_SCALES, simulateGpa } from "@/lib/grades/gpa-sim";

interface Row { id: string; name: string; credits: string; letter: string }

export function GpaSimulator({ initialRows, defaultUniversity }: { initialRows: { name: string; credits: number | null; letter: string | null }[]; defaultUniversity: string | null }) {
  const umich = !!defaultUniversity && /michigan|umich/i.test(defaultUniversity);
  const [scaleKey, setScaleKey] = useState<string>(umich ? "umich" : "standard");
  const [custom, setCustom] = useState<{ letter: string; points: string }[]>(Object.entries(GPA_SCALES.standard.points).map(([letter, p]) => ({ letter, points: String(p) })));
  const [curGpa, setCurGpa] = useState("");
  const [curCredits, setCurCredits] = useState("");
  const [rows, setRows] = useState<Row[]>(() => initialRows.map((r, i) => ({ id: String(i), name: r.name, credits: r.credits?.toString() ?? "", letter: r.letter ?? "" })));

  const points = useMemo(() => (scaleKey === "custom" ? Object.fromEntries(custom.filter((c) => c.letter.trim() && Number.isFinite(Number(c.points))).map((c) => [c.letter.trim(), Number(c.points)])) : GPA_SCALES[scaleKey].points), [scaleKey, custom]);
  const letters = Object.keys(points);
  const gpaN = curGpa === "" ? null : Number(curGpa);
  const crN = Number(curCredits) || 0;
  const maxPoint = Math.max(4, ...Object.values(points));
  const invalidCur = gpaN !== null && (!Number.isFinite(gpaN) || gpaN < 0 || gpaN > maxPoint);
  const result = useMemo(() => simulateGpa(rows.map((r) => ({ id: r.id, name: r.name, credits: Number(r.credits) || 0, letter: r.letter || null })), points, invalidCur ? undefined : { gpa: gpaN, credits: crN }), [rows, points, gpaN, crN, invalidCur]);
  const upd = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><div><CardTitle>GPA simulator</CardTitle><CardDescription>Pick expected letter grades to see a hypothetical semester and cumulative GPA. Nothing is saved, and all math is deterministic.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Grading scale" hint={GPA_SCALES[scaleKey]?.note}>
              <NativeSelect value={scaleKey} onChange={(e) => setScaleKey(e.target.value)}>
                {Object.entries(GPA_SCALES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}<option value="custom">Custom scale…</option>
              </NativeSelect>
            </Field>
            <Field label="Current cumulative GPA" error={invalidCur ? `Enter 0 to ${maxPoint}.` : undefined}><Input type="number" step="0.01" min="0" value={curGpa} onChange={(e) => setCurGpa(e.target.value)} placeholder="e.g. 3.45" /></Field>
            <Field label="Credits completed so far"><Input type="number" min="0" step="0.5" value={curCredits} onChange={(e) => setCurCredits(e.target.value)} placeholder="e.g. 45" /></Field>
          </div>

          {scaleKey === "custom" && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Letter and grade points for your school.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {custom.map((c, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input aria-label="Letter" className="h-8 w-14" value={c.letter} onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, letter: e.target.value } : x)))} />
                    <Input aria-label="Points" type="number" step="0.1" className="h-8 w-16" value={c.points} onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))} />
                    <button aria-label="Remove" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setCustom((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setCustom((p) => [...p, { letter: "", points: "0" }])}><Plus /> Add letter</Button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">This semester&apos;s courses</p>
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Add the courses you want to simulate.</p>}
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Course name" className="min-w-40 flex-1" value={r.name} placeholder="Course" onChange={(e) => upd(r.id, { name: e.target.value })} />
                <Input aria-label="Credits" type="number" min="0" step="0.5" className="w-20" value={r.credits} placeholder="Credits" onChange={(e) => upd(r.id, { credits: e.target.value })} />
                <NativeSelect aria-label="Expected grade" className="w-28" value={r.letter} onChange={(e) => upd(r.id, { letter: e.target.value })}>
                  <option value="">Grade…</option>{letters.map((l) => <option key={l} value={l}>{l} ({points[l]})</option>)}
                </NativeSelect>
                <Button variant="ghost" size="icon" aria-label="Remove course" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { id: crypto.randomUUID(), name: "", credits: "3", letter: "" }])}><Plus /> Add course</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
          <div><p className="text-xs font-medium text-muted-foreground">Hypothetical semester GPA</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{result.semesterGpa === null ? "–" : result.semesterGpa.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{result.semesterCredits} credits counted</p></div>
          <div><p className="text-xs font-medium text-muted-foreground">Projected cumulative GPA</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{result.cumulativeGpa === null || (gpaN === null && !result.semesterGpa) ? "–" : result.cumulativeGpa.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{gpaN === null || crN <= 0 ? "Enter your current GPA and credits to project this." : `${result.cumulativeCredits} credits total`}</p></div>
          {result.skipped.length > 0 && <p className="text-xs text-muted-foreground sm:col-span-2">Not counted (needs credits and a grade from this scale): {result.skipped.join(", ")}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
