"use client";
import { useState, useTransition } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveStudyTasks } from "@/lib/actions/planner";
import { run } from "@/lib/utils/action";
import type { Assignment, StudyTask } from "@/types/database";

interface Step { title: string; minutes: string }

export function BreakdownDialog({ assignment, existing, onClose }: { assignment: Assignment | null; existing: StudyTask[]; onClose: () => void }) {
  return (
    <Dialog open={!!assignment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={assignment ? `Break down: ${assignment.title}` : "Break down"} description="Split it into smaller steps. Suggestions are a starting point. Edit anything.">
        {assignment && <Form key={assignment.id} assignment={assignment} existing={existing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ assignment, existing, onClose }: { assignment: Assignment; existing: StudyTask[]; onClose: () => void }) {
  const [steps, setSteps] = useState<Step[]>(() => existing.filter((t) => !t.done).map((t) => ({ title: t.title, minutes: String(t.estimated_minutes ?? 30) })));
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const done = existing.filter((t) => t.done);

  async function suggest() {
    if (steps.length && !confirm("Replace your current steps with new suggestions?")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/planner/breakdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId: assignment.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error ?? "Couldn't generate suggestions."); return; }
      setSteps((j.steps as { title: string; minutes: number }[]).map((s) => ({ title: s.title, minutes: String(s.minutes) })));
    } catch { toast.error("Network error. Try again."); } finally { setLoading(false); }
  }

  const total = steps.reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  const save = () => start(async () => {
    const r = await run(saveStudyTasks(assignment.id, steps.map((s) => ({ title: s.title, minutes: Math.round(Number(s.minutes)) }))), "Steps saved");
    if (r.ok) onClose();
  });

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={suggest} loading={loading}><Sparkles /> Suggest steps with AI</Button>
      {done.length > 0 && <p className="text-xs text-muted-foreground">{done.length} completed step{done.length === 1 ? "" : "s"} will be kept.</p>}
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input aria-label={`Step ${i + 1}`} value={s.title} onChange={(e) => setSteps((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="e.g. Review lecture notes" />
            <Input aria-label="Minutes" type="number" min="5" className="w-20" value={s.minutes} onChange={(e) => setSteps((p) => p.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))} />
            <span className="text-xs text-muted-foreground">min</span>
            <button aria-label="Remove step" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </li>
        ))}
        {steps.length === 0 && !loading && <li className="text-sm text-muted-foreground">No steps yet. Add your own or let AI suggest some.</li>}
        {loading && <li className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Thinking…</li>}
      </ul>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setSteps((p) => [...p, { title: "", minutes: "30" }])}><Plus /> Add step</Button>
        <p className="text-xs text-muted-foreground">{total ? `${Math.floor(total / 60)}h ${total % 60}m total` : ""}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={pending}>Save steps</Button>
      </div>
    </div>
  );
}
