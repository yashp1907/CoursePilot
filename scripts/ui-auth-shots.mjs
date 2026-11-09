// Dev tool: screenshots the logged-out pages. node scripts/ui-auth-shots.mjs <outDir>
import { chromium } from "playwright-core";
const out = process.argv[2] ?? "shots"; const BASE = process.env.BASE_URL ?? "http://localhost:3124";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const [scheme, vp, tag] of [["light", { width: 1440, height: 900 }, "desktop"], ["dark", { width: 1440, height: 900 }, "desktop"], ["dark", { width: 390, height: 844 }, "mobile"]]) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: vp }); const page = await ctx.newPage();
  for (const p of ["login", "signup"]) { await page.goto(`${BASE}/${p}`, { waitUntil: "networkidle" }); await page.screenshot({ path: `${out}/${p}-${scheme}-${tag}.png` }); }
  await ctx.close();
}
await browser.close(); console.log("done");
