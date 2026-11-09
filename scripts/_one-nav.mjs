import { chromium } from "playwright-core"; import { readFileSync } from "node:fs";
const out = process.argv[2]; const BASE = "http://localhost:3124"; const cred = JSON.parse(readFileSync(`${out}/.cred.json`, "utf8"));
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${BASE}/login`); await page.fill("input[name=email]", cred.email); await page.fill("input[name=password]", cred.password); await page.click("button[type=submit]"); await page.waitForSelector("h1:has-text('Welcome back')");
await page.waitForTimeout(3000); console.log("=== MARK: clicking Assignments"); 
const s = performance.now(); await page.locator('nav a:has-text("Assignments")').first().click(); await page.waitForSelector("h1:has-text('Assignments')"); console.log("click->content", Math.round(performance.now() - s), "ms"); await page.waitForTimeout(1500);
console.log("=== MARK: clicking Grades"); const s2 = performance.now(); await page.locator('nav a:has-text("Grades")').first().click(); await page.waitForSelector("h1:has-text('Grades')"); console.log("click->content", Math.round(performance.now() - s2), "ms"); await page.waitForTimeout(1500);
await b.close();
