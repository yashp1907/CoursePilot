import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { GeminiConfigError } from "@/lib/ai/gemini";
import { crawlCourseSite } from "@/lib/website/crawl";
import { extractFromWebsite } from "@/lib/website/extract";
import { WebFetchError } from "@/lib/website/safe-fetch";
import { userMessage } from "@/lib/utils/errors";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";

export const maxDuration = 60;

const body = z.object({ courseId: z.string().uuid(), force: z.boolean().optional() });

/** Read the course's website, and (unless nothing changed) extract assignments/dates/policies with Gemini. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { courseId, force } = parsed.data;

  const { data: site, error: se } = await supabase.from("course_websites").select("*").eq("course_id", courseId).maybeSingle();
  if (se) return NextResponse.json({ error: /course_websites|schema cache|relation/.test(se.message) ? "The database needs the latest migration (…0005_course_websites.sql)." : se.message }, { status: 503 });
  if (!site) return NextResponse.json({ error: "Add the course website's address first." }, { status: 404 });
  if (site.status === "fetching" && Date.now() - new Date(site.updated_at).getTime() < 90_000) return NextResponse.json({ error: "This site is already being read. Give it a minute." }, { status: 409 });
  const { data: course } = await supabase.from("courses").select("name, code, semester").eq("id", courseId).maybeSingle();

  await supabase.from("course_websites").update({ status: "fetching", error: null }).eq("id", site.id);
  const fail = async (message: string, status: number) => {
    await supabase.from("course_websites").update({ status: "failed", error: message }).eq("id", site.id);
    return NextResponse.json({ error: message }, { status });
  };

  try {
    const crawl = await crawlCourseSite(site.url);
    const hash = createHash("sha256").update(crawl.pages.map((p) => p.text).join("\n---\n")).digest("hex");
    const pagesMeta = crawl.pages.map((p) => ({ url: p.url, title: p.title, chars: p.chars }));
    const stored = site.extracted ? syllabusExtractionSchema.safeParse(site.extracted) : null;

    if (!force && stored?.success && site.content_hash === hash) {
      await supabase.from("course_websites").update({ status: "ready", pages: pagesMeta, last_fetched_at: new Date().toISOString() }).eq("id", site.id);
      return NextResponse.json({ ok: true, unchanged: true, pages: pagesMeta, warnings: crawl.warnings });
    }
    const { data } = await extractFromWebsite(crawl, { courseName: course?.code ?? course?.name ?? null, semester: /\b(fall|winter|spring|summer)\b.*\d{2,4}|\b(fa|wn|sp|su)\s?-?\d{2,4}\b/i.test(course?.semester ?? "") ? course!.semester : null });
    await supabase.from("course_websites").update({ status: "ready", extracted: data, content_hash: hash, pages: pagesMeta, last_fetched_at: new Date().toISOString(), error: null }).eq("id", site.id);
    return NextResponse.json({ ok: true, unchanged: false, pages: pagesMeta, warnings: data.warnings });
  } catch (e) {
    if (e instanceof WebFetchError) return fail(e.message, e.code === "invalid_url" || e.code === "blocked" ? 400 : 502);
    console.error("website fetch failed", e);
    return fail(userMessage(e, "We couldn't read that site. Please try again in a moment."), e instanceof GeminiConfigError ? 503 : 502);
  }
}
