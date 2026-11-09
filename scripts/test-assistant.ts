/**
 * Live check: sends real questions through Gemini with the tool-calling loop against a fictional student.
 *   npm run test:assistant
 */
import { runAssistant } from "../lib/ai/assistant";
import { fixtureSnapshot } from "../lib/ai/fixture";

const questions = [
  "What assignments do I have due this week?",
  "What do I need on my IOE 310 final to get an A?",
  "What percentage of my IOE 310 grade comes from homework?",
  "Explain the late submission policy for IOE 310.",
  "Which class should I prioritize this week?",
  "What was added to Canvas recently, and did any deadlines change?",
  "What's the late policy for EECS 280?",
  "Who are the TAs for IOE 310 and when are their office hours?",
  "When and where does my IOE 310 lecture meet, and what's the Ed link?",
];

async function main() {
  const snapshot = fixtureSnapshot();
  const only = process.env.ONLY?.split("|");
  for (const q of questions.filter((x) => !only || only.some((o) => x.includes(o)))) {
    const t0 = Date.now();
    let r;
    for (let attempt = 0; ; attempt++) {
      try { r = await runAssistant({ snapshot, history: [], message: q }); break; }
      catch (e) { if (attempt < 3 && /rate limit/i.test(String(e))) { console.log("(rate limited, waiting 40s)"); await new Promise((res) => setTimeout(res, 40_000)); continue; } throw e; }
    }
    console.log(`\nQ: ${q}\nTools: ${r.toolsUsed.join(", ") || "(none)"}  [${((Date.now() - t0) / 1000).toFixed(1)}s]\nA: ${r.text}\nCites: ${r.citations.map((c) => c.label).join(" | ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
