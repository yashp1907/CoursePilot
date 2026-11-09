"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseChip } from "@/components/ui/course-chip";
import { Input, NativeSelect } from "@/components/ui/input";
import { setCourseWebsite } from "@/lib/actions/website";

export interface WebsiteListItem { courseId: string; label: string; name: string; color: string; url: string | null; lastFetched: string | null; lastApplied: string | null; status: string | null }

export function WebsitesCard({ items }: { items: WebsiteListItem[] }) {
  const router = useRouter();
  const without = items.filter((i) => !i.url);
  const [courseId, setCourseId] = useState(without[0]?.courseId ?? "");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const r = await setCourseWebsite(courseId, url.trim());
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(`/courses/${courseId}?tab=website`);
  }

  return (
    <Card>
      <CardHeader><div>
        <CardTitle className="flex items-center gap-2"><Globe className="size-4" /> Course websites</CardTitle>
        <CardDescription>For courses that keep their schedule and assignments on their own site instead of Canvas (EECS and many others). CoursePilot reads the public schedule/syllabus pages and finds the due dates.</CardDescription>
      </div></CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Add a course first, then connect its website here.</p> : (
          <ul className="divide-y rounded-lg border">
            {items.map((i) => (
              <li key={i.courseId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2.5"><CourseChip color={i.color} label={i.label} />
                  {i.url ? <span className="min-w-0 truncate text-muted-foreground">{new URL(i.url).host}{i.lastFetched ? ` · read ${formatDistanceToNow(new Date(i.lastFetched), { addSuffix: true })}` : " · not read yet"}</span> : <span className="text-muted-foreground">No website</span>}
                  {i.status === "failed" && <Badge variant="danger">Failed</Badge>}</span>
                <Button asChild size="sm" variant={i.url ? "outline" : "ghost"}><Link href={`/courses/${i.courseId}?tab=website`}>{i.url ? "Open" : "Set up"}</Link></Button>
              </li>
            ))}
          </ul>
        )}
        {without.length > 0 && (
          <form onSubmit={add} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Connect a course website</p>
            <div className="flex flex-wrap gap-2">
              <NativeSelect aria-label="Course" className="w-auto" value={courseId} onChange={(e) => setCourseId(e.target.value)}>{without.map((i) => <option key={i.courseId} value={i.courseId}>{i.label}</option>)}</NativeSelect>
              <Input aria-label="Website address" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://eecs280.org/" className="min-w-60 flex-1" />
              <Button type="submit" loading={busy}>Continue</Button>
            </div>
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
