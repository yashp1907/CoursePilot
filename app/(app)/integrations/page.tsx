import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { CanvasPanel, type SyncRow } from "@/components/layout/canvas-panel";
import { canvasOAuthConfigured, getConnection } from "@/lib/canvas/connection";
import { createClient } from "@/lib/supabase/server";
import { WebsitesCard, type WebsiteListItem } from "@/components/layout/websites-card";
import { listCourses } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [connection, hist, courses, sites] = await Promise.all([
    getConnection(supabase),
    supabase.from("canvas_sync_history").select("id, status, summary, error, started_at, finished_at").order("started_at", { ascending: false }).limit(8),
    listCourses(),
    supabase.from("course_websites").select("course_id, url, status, last_fetched_at, last_applied_at"),
  ]);
  const byCourse = new Map((sites.error ? [] : sites.data ?? []).map((s) => [s.course_id as string, s]));
  const websiteItems: WebsiteListItem[] = courses.map((c) => { const s = byCourse.get(c.id); return { courseId: c.id, label: c.code ?? c.name, name: c.name, color: c.color, url: (s?.url as string) ?? null, lastFetched: (s?.last_fetched_at as string) ?? null, lastApplied: (s?.last_applied_at as string) ?? null, status: (s?.status as string) ?? null }; });
  const err = sp.error === "oauth_not_configured" ? "Canvas OAuth isn't configured on this server. Use an access token instead." : sp.error;
  return (
    <>
      <PageHeader title="Integrations" description="Connect other tools. Everything in CoursePilot works without them." />
      <CanvasPanel connection={connection} history={(hist.data ?? []) as SyncRow[]} oauthConfigured={canvasOAuthConfigured()} defaultBaseUrl={connection?.base_url ?? process.env.CANVAS_BASE_URL ?? ""} flash={{ error: err, connected: sp.connected === "1" }} />
      <div className="mt-5 max-w-3xl"><WebsitesCard items={websiteItems} /></div>
    </>
  );
}
