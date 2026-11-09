// Dev tool: renders the PWA icons from the logo mark. Usage: node scripts/make-icons.mjs
import { chromium } from "playwright-core";
const mark = (scale, tx, ty) => `<g transform="translate(${tx} ${ty}) scale(${scale})"><path d="M8 21.5 16 7l8 14.5-8-3.2-8 3.2Z" fill="#fff"/><path d="M16 18.3V7" stroke="#3d52e0" stroke-width="1.4"/></g>`;
const svg = (size, { rounded, inner }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c7df0"/><stop offset="1" stop-color="#3d52e0"/></linearGradient></defs>
<rect width="100" height="100" ${rounded ? 'rx="22"' : ""} fill="url(#g)"/>${mark(inner, 50 - 16 * inner, 50 - 14.5 * inner)}</svg>`;
const jobs = [
  ["icon-192.png", 192, { rounded: true, inner: 3.1 }, true],
  ["icon-512.png", 512, { rounded: true, inner: 3.1 }, true],
  ["maskable-512.png", 512, { rounded: false, inner: 2.6 }, false],
  ["apple-touch-icon.png", 180, { rounded: false, inner: 3.1 }, false],
];
const b = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const [name, size, opt, transparent] of jobs) {
  const page = await b.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size, opt)}</body>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: transparent });
  await page.close();
}
await b.close(); console.log("icons written");
