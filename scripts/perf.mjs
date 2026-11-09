// Dev tool: measures how long real clicks take to show content (production build recommended).
//   node scripts/perf.mjs <dir with .cred.json> [baseUrl]
import { chromium } from "playwright-core"; import { readFileSync } from "node:fs";
const out = process.argv[2]; const BASE = process.argv[3] ?? "http://localhost:3124"; const cred = JSON.parse(readFileSync(`${out}/.cred.json`, "utf8"));
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let page;
const RUNS = Number(process.env.RUNS ?? 1);
const all = [];
const serverMs = new Map();
let rows = [];
const timeIt = async (label, fn, ready) => { const s = performance.now(); await fn(); await ready(); rows.push([label, Math.round(performance.now() - s)]); };
async function runOnce() {
  rows = [];
  page = await ctx.newPage();
  page.on("response", async (res) => { const req = res.request(); if (req.headers()["rsc"] === "1" && !req.headers()["next-router-prefetch"]) { const t = req.timing(); if (t.responseStart > 0) { const k = new URL(res.url()).pathname + (new URL(res.url()).search.includes("tab=") ? "?" + new URL(res.url()).search.match(/tab=\w+/)?.[0] : ""); (serverMs.get(k) ?? serverMs.set(k, []).get(k)).push(Math.round(t.responseStart)); } } });
  let s = performance.now();
await page.goto(`${BASE}/login`); await page.fill("input[name=email]", cred.email); await page.fill("input[name=password]", cred.password); await page.click("button[type=submit]");
await page.waitForSelector("h1:has-text('Welcome back')"); rows.push(["login -> dashboard rendered", Math.round(performance.now() - s)]);
const HOVER = Number(process.env.HOVER_MS ?? 0);
  const nav = async (name, heading) => { const loc = page.locator(`nav a:has-text("${name}")`).first(); if (HOVER) { await loc.hover(); await page.waitForTimeout(HOVER); } return timeIt(`click "${name}"`, () => loc.click(), () => page.waitForSelector(`h1:has-text("${heading}")`, { timeout: 30000 })); };
for (const [name, h] of [["My Courses", "My Courses"], ["Assignments", "Assignments"], ["Calendar", "Calendar"], ["Grades", "Grades"], ["Study Planner", "Study Planner"], ["Insights", "Insights"], ["AI Assistant", "AI Assistant"], ["Settings", "Settings"], ["Overview", "Welcome back"]]) await nav(name, h);
// revisit (second visit) to see caching
await nav("Assignments", "Assignments"); rows[rows.length - 1][0] += " (2nd visit)";
await nav("My Courses", "My Courses"); rows[rows.length - 1][0] += " (2nd visit)";
// a course and its tabs
{ const loc = page.locator('nav a:has-text("EECS 280")').first(); if (HOVER) { await loc.hover(); await page.waitForTimeout(HOVER); }
  await timeIt('open course "EECS 280"', () => loc.click(), () => page.waitForSelector("h1:has-text('Programming')", { timeout: 30000 })); }
for (const [tab, marker] of [["Assignments", "New assignment"], ["Grades", "Current grade"], ["Course info", "Course info"], ["Syllabus", "Syllabus"], ["Course site", "course website"], ["AI Assistant", "Ask about your semester"], ["Overview", "Upcoming deadlines"]]) {
  const tl = page.getByRole("tab", { name: tab }); if (HOVER) { await tl.hover(); await page.waitForTimeout(HOVER); }
  await timeIt(`course tab "${tab}"`, () => tl.click(), () => page.waitForSelector(`text=${marker}`, { timeout: 30000 }));
}
// an action: mark a dashboard deadline complete
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
const before = await page.locator('button[aria-label^="Mark"]').count();
if (before) { const t0 = performance.now(); await page.locator('button[aria-label^="Mark"]').first().click(); await page.waitForFunction((n) => document.querySelectorAll('button[aria-label^="Mark"]').length < n, before); rows.push(["mark deadline complete (UI update)", Math.round(performance.now() - t0)]); await page.waitForTimeout(1500); }


  all.push(rows); await page.close();
}
for (let i = 0; i < RUNS; i++) { await ctx.clearCookies(); await runOnce(); }
const med = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const labels = all[0].map((r) => r[0]);
const w = Math.max(...labels.map((l) => l.length));
let total = 0;
labels.forEach((l, i) => { const ms = med(all.map((r) => r[i][1])); total += ms; console.log(l.padEnd(w + 2), String(ms).padStart(6), "ms", all.length > 1 ? `  (runs: ${all.map((r) => r[i][1]).join(", ")})` : "", ms > 1200 ? "  <-- slow" : ""); });
console.log("TOTAL (median per interaction)", total, "ms across", labels.length, "interactions");
console.log("\nserver response time for page requests (ms to first byte, median):");
for (const [k, v] of serverMs) console.log("  ", k.padEnd(60), med(v));
await b.close();
