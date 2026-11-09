"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ExternalLink, Globe, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExtractionEditor } from "./extraction-editor";
import { applyWebsite, removeCourseWebsite, saveWebsiteExtraction, setCourseWebsite } from "@/lib/actions/website";
import { run } from "@/lib/utils/action";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";
import { cleanStored } from "@/lib/utils/errors";
import type { Assignment } from "@/types/database";

export interface SiteRow { url: string; status: string; error: string | null; pages: { url: string; title: string; chars: number }[]; extracted: unknown; last_fetched_at: string | null; last_applied_at: string | null; updated_at: string }

export function WebsitePanel({ courseId, courseLabel, site, existing }: { courseId: string; courseLabel: string; site: SiteRow | null; existing: Assignment[] }) {
  const router = useRouter();
  const [url, setUrl] = useState(site?.url ?? "");
  const [editing, setEditing] = useState(!site);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function read(force = false) {
    setBusy("reading"); setError(null);
    try {
      const res = await fetch("/api/website/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, force }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Couldn't read that site."); return; }
      toast.success(j.unchanged ? "No changes on the site since last time." : "Site read. Review what was found below.");
    } catch { setError("Network error while reading the site."); }
    finally { setBusy(null); router.refresh(); }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setBusy("saving"); setError(null);
    const r = await setCourseWebsite(courseId, url.trim());
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setUrl(r.data.url); setEditing(false);
    await read(true);
  }

  const parsed = site?.extracted ? syllabusExtractionSchema.safeParse(site.extracted) : null;
  const host = site ? new URL(site.url).host : "";

  if (!site || editing) {
    return (
      <div className="max-w-2xl space-y-4">
        <Card><CardContent className="space-y-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Globe className="size-5" /></div>
            <div>
              <p className="font-medium">Does {courseLabel} keep its schedule on its own website?</p>
              <p className="mt-1 text-sm text-muted-foreground">Many courses (EECS, for example) post the schedule, project deadlines, and exam dates on a course site instead of Canvas. Paste the address and CoursePilot will read the schedule and policy pages, find the due dates, and let you review everything before it&apos;s added.</p>
            </div>
          </div>
          <form onSubmit={connect} className="space-y-2">
            <label htmlFor="site-url" className="text-sm font-medium">Course website address</label>
            <div className="flex flex-wrap gap-2">
              <Input id="site-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://eecs280.org/" className="min-w-64 flex-1" autoComplete="off" />
              <Button type="submit" loading={busy !== null}>{busy === "reading" ? "Reading site…" : "Read this site"}</Button>
              {site && <Button type="button" variant="outline" onClick={() => { setEditing(false); setUrl(site.url); }}>Cancel</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Works with public pages (no login). It reads the page you give plus a few same-site pages like the schedule and syllabus. It respects the site&apos;s robots.txt, and takes 10–30 seconds.</p>
          </form>
          {error && <p className="flex gap-2 rounded-md bg-red-500/10 p-3 text-sm text-destructive" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</p>}
          {busy === "reading" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the site and finding due dates…</p>}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Globe className="size-[18px]" /></div>
          <div className="min-w-0">
            <a href={site.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-sm font-medium hover:text-primary">{host} <ExternalLink className="size-3.5" /></a>
            <p className="text-xs text-muted-foreground">
              {site.last_fetched_at ? `Read ${formatDistanceToNow(new Date(site.last_fetched_at), { addSuffix: true })}` : "Not read yet"}
              {site.last_applied_at ? ` · imported ${formatDistanceToNow(new Date(site.last_applied_at), { addSuffix: true })}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => read(false)} loading={busy === "reading"}><RefreshCw /> {parsed?.success ? "Check for updates" : "Read site"}</Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Change</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (!confirm("Stop using this website? Assignments you already imported stay in CoursePilot.")) return; start(async () => { await run(removeCourseWebsite(courseId), "Website removed"); }); }}><Trash2 /></Button>
        </div>
      </div>

      {(error || site.status === "failed") && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-red-500/5 p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div><p className="font-medium">Couldn&apos;t read this site</p><p className="mt-0.5 text-muted-foreground">{error ?? cleanStored(site.error, "We couldn't read this site. Please try again.")}</p></div>
        </div>
      )}

      {site.pages.length > 0 && (
        <details className="rounded-lg border bg-card px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium">Pages read <Badge className="ml-1">{site.pages.length}</Badge></summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">{site.pages.map((p) => <li key={p.url} className="truncate"><a className="hover:text-primary hover:underline" href={p.url} target="_blank" rel="noopener noreferrer">{p.title || p.url}</a> <span className="text-xs">· {new URL(p.url).pathname} · {Math.round(p.chars / 100) / 10}k characters</span></li>)}</ul>
        </details>
      )}

      {parsed?.success ? (
        <ExtractionEditor courseId={courseId} initial={parsed.data} resetKey={site.updated_at} existing={existing} applied={!!site.last_applied_at}
          onSave={saveWebsiteExtraction} onApply={applyWebsite} applyLabel="Import from website" updatableSources={["website", "syllabus"]} noun="course website" defaultUpdateCourse={false} />
      ) : site.status !== "failed" && (
        <p className="text-sm text-muted-foreground">Click <b>Read site</b> to find assignments, exams, and policies on this website.</p>
      )}
    </div>
  );
}
