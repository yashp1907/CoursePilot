// Dev tool: drives your installed Chrome with a throwaway account and saves screenshots for visual review.
//   node scripts/ui-shots.mjs <outDir> [light|dark] [desktop|mobile]
import { chromium } from "playwright-core";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const [, , out = "shots", scheme = "light", device = "desktop"] = process.argv;
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const credFile = `${out}/.cred.json`;
let cred = existsSync(credFile) ? JSON.parse(readFileSync(credFile, "utf8")) : null;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await browser.newContext({ colorScheme: scheme, viewport: device === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: device === "mobile" ? 2 : 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });

async function login() {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', cred.email); await page.fill('input[name=password]', cred.password);
  await page.click('button[type=submit]'); await page.waitForURL("**/dashboard", { timeout: 20000 });
}
if (!cred) {
  cred = { email: `e2e-ui-${Date.now()}@example.com`, password: "Passw0rd!e2eUI" };
  await page.goto(`${BASE}/signup`);
  await page.fill('input[name=full_name]', "Yash Patel"); await page.fill('input[name=email]', cred.email); await page.fill('input[name=password]', cred.password);
  await page.click('button[type=submit]'); await page.waitForURL("**/dashboard", { timeout: 30000 });
  writeFileSync(credFile, JSON.stringify(cred));
  await page.goto(`${BASE}/settings`); await page.getByRole("button", { name: /load demo data/i }).click();
  await page.waitForSelector("text=Demo data loaded", { timeout: 30000 });
} else await login();

const pages = (process.env.PAGES ?? "dashboard,courses,assignments,calendar,grades,planner,insights,assistant,settings,integrations").split(",");
let courseHref = null;
for (const p of pages) {
  let target = p;
  if (p.startsWith("course/")) {
    if (!courseHref) { await page.goto(`${BASE}/courses`, { waitUntil: "networkidle" }); courseHref = await page.locator('nav a[href^="/courses/"]').first().getAttribute("href"); }
    target = `${courseHref.replace(/^\//, "")}?tab=${p.split("/")[1]}`;
  }
  await page.goto(`${BASE}/${target}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${p.replace(/[/?=&]/g, "_")}-${scheme}-${device}.png`, fullPage: true });
}
await browser.close();
console.log("done");
