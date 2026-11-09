"use client";
import { useState, useTransition } from "react";
import { GitMerge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { dismissDuplicate, mergeDuplicate } from "@/lib/actions/duplicates";
import { run } from "@/lib/utils/action";
import { formatDue } from "@/lib/utils/dates";
import type { DupPair } from "@/lib/duplicates";
import type { Course } from "@/types/database";

const SRC: Record<string, string> = { syllabus: "Syllabus", manual: "You added", canvas: "Canvas" };

export function DuplicatesBanner({ pairs, courses }: { pairs: DupPair[]; courses: Course[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (pairs.length === 0) return null;
  const label = (id: string) => courses.find((c) => c.id === id)?.code ?? courses.find((c) => c.id === id)?.name ?? "";

  const merge = (p: DupPair) => start(async () => { const r = await run(mergeDuplicate(p.keep.id, p.drop.id, p.kind), "Merged"); void r; });
  const mergeAll = () => start(async () => {
    let ok = 0;
    for (const p of pairs) { const r = await mergeDuplicate(p.keep.id, p.drop.id, p.kind); if (r.ok) ok++; }
    toast.success(`Merged ${ok} duplicate${ok === 1 ? "" : "s"}`);
    setOpen(false);
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2"><GitMerge className="size-4 text-warning" /><span><b>{pairs.length}</b> assignment{pairs.length === 1 ? "" : "s"} look like duplicates of Canvas items (from your syllabus or ones you added).</span></p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Review</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Possible duplicates" description="Merging keeps the Canvas version (so deadlines stay current) and carries over your category, notes, time estimate, priority and any grade or progress. Nothing is lost." className="max-w-2xl">
          <ul className="space-y-3">
            {pairs.map((p) => (
              <li key={p.key} className="rounded-md border p-3">
                <p className="mb-2 text-xs text-muted-foreground">{label(p.keep.course_id)} · {p.kind === "covered" ? "Canvas already lists these individually" : p.reasons.join(", ")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded bg-primary-soft/50 p-2"><Badge variant="primary">Canvas · keeps</Badge><p className="mt-1 text-sm font-medium">{p.keep.title}</p><p className="text-xs text-muted-foreground">{formatDue(p.keep.due_at)}</p></div>
                  <div className="rounded bg-muted p-2"><Badge>{SRC[p.drop.source] ?? p.drop.source} · merged in</Badge><p className="mt-1 text-sm font-medium">{p.drop.title}</p><p className="text-xs text-muted-foreground">{formatDue(p.drop.due_at)}</p></div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await run(dismissDuplicate(p.keep.course_id, p.keep.id, p.drop.id), "Got it. Keeping both"); })}>Not a duplicate</Button>
                  <Button size="sm" loading={pending} onClick={() => merge(p)}>{p.kind === "covered" ? "Remove placeholder" : "Merge"}</Button>
                </div>
              </li>
            ))}
          </ul>
          {pairs.length > 1 && <div className="mt-4 flex justify-end"><Button onClick={mergeAll} loading={pending}>Merge all {pairs.length}</Button></div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
