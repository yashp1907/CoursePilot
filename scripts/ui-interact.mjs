// Dev tool: exercises reorder + recolor in a real browser against the running dev server.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const [, , out] = process.argv; const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const cred = JSON.parse(readFileSync(`${out}/.cred.json`, "utf8"));
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let fails = 0; const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? `  (${x})` : ""}`); if (!ok) fails++; };
await page.goto(`${BASE}/login`); await page.fill("input[name=email]", cred.email); await page.fill("input[name=password]", cred.password); await page.click("button[type=submit]"); await page.waitForURL("**/dashboard");
await page.goto(`${BASE}/courses`, { waitUntil: "networkidle" });
const codes = async () => (await page.locator("article h3").allTextContents()).map((t) => t.slice(0, 12));

// --- recolor from the card ---
const card = page.locator("article").first();
await card.getByRole("button", { name: /change color/i }).click();
await page.getByRole("radio", { name: "Rose" }).click();
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
await page.reload({ waitUntil: "networkidle" });
const bar = await page.locator("article").first().locator("div").first().evaluate((el) => getComputedStyle(el).backgroundImage);
check("recolor persists after reload (card accent is now rose)", /224, 69, 123|e0457b/i.test(bar), bar.slice(0, 80));
const sidebarDot = await page.locator('nav a[href^="/courses/"] span').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check("sidebar dot uses the new color", sidebarDot === "rgb(224, 69, 123)", sidebarDot);

// custom hex
await page.locator("article").first().getByRole("button", { name: /change color/i }).click();
await page.locator('input[type=color]').first().evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "#12a4b6"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.waitForTimeout(1500); await page.reload({ waitUntil: "networkidle" });
const dot2 = await page.locator('nav a[href^="/courses/"] span').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check("custom #12a4b6 color saved and shown", dot2 === "rgb(18, 164, 182)", dot2);

// --- reorder: arrows ---
await page.getByRole("button", { name: /^reorder$/i }).click();
await page.getByRole("button", { name: /Move IOE 333 earlier/ }).click();
const after = await codes();
check("arrow moves IOE 333 ahead of IOE 310 immediately", after[0].startsWith("Quality") && after[1].startsWith("Introduction"), after.join(" | "));
await page.waitForTimeout(1800);
const toast = await page.locator("[data-sonner-toast]").allTextContents();
console.log("toast:", toast.join(" / ").slice(0, 160) || "(none)");
await page.screenshot({ path: `${out}/reorder-mode.png` });
await page.getByRole("button", { name: /done/i }).click();
await browser.close(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
