/**
 * Live check of syllabus extraction against Gemini. Requires GEMINI_API_KEY and GEMINI_MODEL.
 *   npm run test:gemini            (uses fixtures/sample-syllabus.pdf)
 *   npm run test:gemini -- path/to/real-syllabus.pdf
 */
import { readFileSync } from "node:fs";
import { generateStructured, getGeminiModel } from "../lib/ai/gemini";
import { syllabusExtractionSchema } from "../lib/ai/schemas";
import { SYLLABUS_SYSTEM_PROMPT, syllabusUserPrompt } from "../lib/ai/prompts";

async function main() {
  const file = process.argv[2] ?? "fixtures/sample-syllabus.pdf";
  console.log(`Model: ${getGeminiModel()}\nFile:  ${file}`);
  const t0 = Date.now();
  const { data } = await generateStructured({
    schema: syllabusExtractionSchema, system: SYLLABUS_SYSTEM_PROMPT,
    prompt: syllabusUserPrompt({ today: new Date().toISOString().slice(0, 10) }),
    files: [{ mimeType: "application/pdf", data: readFileSync(file) }],
  });
  console.log(`\nValidated in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  console.log(JSON.stringify(data, null, 2));
  if (file.endsWith("sample-syllabus.pdf")) {
    const checks: [string, boolean][] = [
      ["course code mentions DEMO 101", /DEMO\s*101/i.test(data.course.code ?? data.course.name ?? "")],
      ["professor extracted", /Sample Person/i.test(data.course.professor ?? "")],
      ["4 grading categories", data.grading.categories.length === 4],
      ["weights total 100", data.grading.categories.reduce((s, c) => s + (c.weight ?? 0), 0) === 100],
      ["homework drops 1", data.grading.categories.some((c) => /home/i.test(c.name) && c.drop_lowest === 1)],
      ["midterm on 2026-10-15", [...data.assignments, ...data.important_dates].some((x) => /midterm/i.test(x.title) && ("due_date" in x ? x.due_date : x.date) === "2026-10-15")],
      ["final on 2026-12-14", [...data.assignments, ...data.important_dates].some((x) => /final/i.test(x.title) && ("due_date" in x ? x.due_date : x.date) === "2026-12-14")],
      ["did NOT invent weekly homework dates", data.assignments.filter((a) => /homework/i.test(a.title) && a.due_date).length === 0],
      ["late policy captured", !!data.policies.late_submission],
    ];
    console.log("\nChecks:");
    for (const [name, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
