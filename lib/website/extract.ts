import "server-only";
import { generateStructured } from "@/lib/ai/gemini";
import { WEBSITE_SYSTEM_PROMPT, websiteUserPrompt } from "@/lib/ai/prompts-website";
import { syllabusExtractionSchema, type SyllabusExtraction } from "@/lib/ai/schemas";
import type { CrawlResult } from "./crawl";
import { postProcessWebsiteExtraction } from "./postprocess";

/** Crawl result -> validated extraction (same shape as a syllabus extraction, so the same review/apply flow works). */
export async function extractFromWebsite(crawl: CrawlResult, ctx: { courseName: string | null; semester: string | null; today?: Date }): Promise<{ data: SyllabusExtraction; model: string }> {
  const today = (ctx.today ?? new Date()).toISOString().slice(0, 10);
  const { data, model } = await generateStructured({
    schema: syllabusExtractionSchema, system: WEBSITE_SYSTEM_PROMPT,
    prompt: websiteUserPrompt({ today, courseHint: ctx.courseName, semesterHint: ctx.semester, pages: crawl.pages }),
  });
  return { data: postProcessWebsiteExtraction(data, { today: ctx.today ?? new Date(), baseUrl: crawl.startUrl, crawlWarnings: crawl.warnings }), model };
}
