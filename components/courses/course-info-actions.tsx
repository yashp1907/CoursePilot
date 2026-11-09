"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enrichCourseInfo, summarizeSync, syncCanvas } from "@/lib/canvas/client-sync";

/** Re-syncs Canvas (so the pages are read again) and then reads any pending course pages. */
export function InfoActions({ courseId, canvasMethod, pending, failed, connected }: { courseId: string; canvasMethod: "api" | "extension" | null; pending: boolean; failed?: boolean; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function update() {
    if (!canvasMethod) return;
    setBusy("Syncing Canvas…");
    const r = await syncCanvas(canvasMethod, { onInfoProgress: (label) => setBusy(`Reading ${label}…`) });
    setBusy(null);
    if (!r.ok) toast.error(r.error); else toast.success(r.info?.error ? `Canvas synced, but course pages: ${r.info.error}` : `Canvas synced: ${summarizeSync(r.summary)}`);
    router.refresh();
  }
  async function finishReading() {
    setBusy("Reading course pages…");
    const r = await enrichCourseInfo((label) => setBusy(`Reading ${label}…`));
    setBusy(null);
    if (r.error) toast.error(r.error); else toast.success("Course info updated");
    router.refresh();
  }
  async function retry() {
    setBusy("Reading course pages…");
    try {
      const res = await fetch("/api/canvas/course-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(j.error ?? "Couldn't read the course pages.");
      else if (j.processed?.status === "failed") toast.error(j.processed.error ?? "Still couldn't read the course pages.");
      else toast.success("Course info updated");
    } catch { toast.error("Network error. Please try again."); }
    setBusy(null);
    router.refresh();
  }
  return (
    <div className="flex items-center gap-2">
      {busy && <span className="text-xs text-muted-foreground">{busy}</span>}
      {failed && !pending && <Button size="sm" variant="outline" onClick={retry} disabled={!!busy}>Try again</Button>}
      {pending && <Button size="sm" variant="outline" onClick={finishReading} disabled={!!busy}>Finish reading</Button>}
      {connected && canvasMethod && <Button size="sm" onClick={update} loading={!!busy}><RefreshCw /> Update from Canvas</Button>}
    </div>
  );
}
