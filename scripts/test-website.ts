/**
 * Live check: crawl a real course website and extract it with Gemini.
 *   npm run test:website -- https://eecs280.org/
 */
import { crawlCourseSite } from "../lib/website/crawl";
import { extractFromWebsite } from "../lib/website/extract";

async function main() {
  const url = process.argv[2] ?? "https://eecs280.org/";
  console.log(`Crawling ${url} …`);
  const crawl = await crawlCourseSite(url);
  console.log(`Read ${crawl.pages.length} page(s):`);
  for (const p of crawl.pages) console.log(`  ${p.url}  (${p.chars} chars)  ${p.title}`);
  if (crawl.warnings.length) console.log("Crawl warnings:", crawl.warnings);
  if (process.env.SHOW_TEXT) console.log("\n---- first page text (first 3500 chars) ----\n" + crawl.pages[0].text.slice(0, 3500));
  const t0 = Date.now();
  const { data, model } = await extractFromWebsite(crawl, { courseName: "EECS 280", semester: "Fall 2026" });
  console.log(`\nExtracted with ${model} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Course: ${JSON.stringify(data.course)}`);
  console.log(`\nASSIGNMENTS (${data.assignments.length}):`);
  for (const a of data.assignments) console.log(`  ${a.due_date ?? "no date  "} ${a.due_time ?? "     "} [${a.type}] ${a.title}${a.weekday ? ` (${a.weekday})` : ""}${a.url ? `  -> ${a.url}` : ""}`);
  console.log(`\nIMPORTANT DATES (${data.important_dates.length}):`);
  for (const d of data.important_dates) console.log(`  ${d.date ?? "no date  "} [${d.kind}] ${d.title}`);
  console.log(`\nGrading: ${data.grading.categories.map((c) => `${c.name} ${c.weight}%`).join(", ") || "(none found)"}`);
  console.log(`Late policy: ${data.policies.late_submission ?? "(none)"}`);
  console.log(`\nWarnings:`, data.warnings);
}
main().catch((e) => { console.error(e); process.exit(1); });
