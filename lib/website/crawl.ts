import { parseHtml, type PageLink } from "./html";
import { robotsAllows, safeFetchText, validatePublicUrl, WebFetchError, type SafeFetchOptions } from "./safe-fetch";

export interface CrawledPage { url: string; title: string; chars: number; text: string }
export interface CrawlResult { pages: CrawledPage[]; warnings: string[]; startUrl: string }

// Pages on the same site that usually hold dates and policies, ranked by how useful they usually are.
const RELEVANT: [RegExp, number][] = [
  [/schedule|calendar|timeline|syllabus|deadline/i, 10], [/assign|homework|\bhw\b|problem[-_ ]?set|pset|project|\blab(s)?\b|exam|quiz|midterm/i, 8],
  [/polic|grading|late|extension|logistics|info|about/i, 5],
];
const SKIP_LINK = /archive|previous|past[-_ ]?terms?|staff|people|office[-_ ]?hours|piazza|discord|slack|login|signin|logout|mailto:|tel:|\.(pdf|zip|png|jpe?g|gif|svg|css|js|ico|mp4|mov|pptx?|docx?|xlsx?|tar|gz|ics)(\?|$)/i;

/** Which links on the start page are worth reading too? Same site only; limited and ranked. */
export function pickRelevantLinks(links: PageLink[], startUrl: string, limit = 7): string[] {
  const origin = new URL(startUrl).origin;
  const seen = new Set<string>([startUrl.split("#")[0]]);
  const scored: { href: string; score: number }[] = [];
  for (const l of links) {
    let u: URL;
    try { u = new URL(l.href); } catch { continue; }
    if (u.origin !== origin) continue;
    u.hash = ""; const href = u.toString();
    if (seen.has(href) || SKIP_LINK.test(u.pathname + " " + l.text) || SKIP_LINK.test(href)) continue;
    const hay = `${u.pathname} ${l.text}`;
    const score = RELEVANT.reduce((s, [re, w]) => (re.test(hay) ? Math.max(s, w) : s), 0);
    if (score > 0) { seen.add(href); scored.push({ href, score }); }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.href);
}

/** Read a course site: the page you gave plus the few same-site pages that carry schedule, policy and assignment info. */
export async function crawlCourseSite(startUrl: string, opts: SafeFetchOptions & { maxPages?: number; maxChars?: number } = {}): Promise<CrawlResult> {
  const start = validatePublicUrl(startUrl);
  const warnings: string[] = [];
  const maxPages = opts.maxPages ?? 8, maxChars = opts.maxChars ?? 90_000;

  // Be a polite guest: honor robots.txt.
  try {
    const robots = await safeFetchText(new URL("/robots.txt", start).toString(), { ...opts, maxBytes: 100_000, timeoutMs: 5000 });
    if (!robotsAllows(robots.text, start.pathname || "/")) throw new WebFetchError("This site asks automated tools not to read it (robots.txt), so CoursePilot won't.", "robots");
  } catch (e) { if (e instanceof WebFetchError && e.code === "robots") throw e; /* no robots.txt: fine */ }

  const first = await safeFetchText(start.toString(), opts);
  const parsed = parseHtml(first.text, first.url);
  const pages: CrawledPage[] = [{ url: first.url, title: parsed.title, chars: parsed.text.length, text: parsed.text }];

  const targets = pickRelevantLinks(parsed.links, first.url, maxPages - 1);
  const results = await Promise.allSettled(targets.map(async (href) => {
    const f = await safeFetchText(href, opts);
    const p = parseHtml(f.text, f.url);
    return { url: f.url, title: p.title, chars: p.text.length, text: p.text } satisfies CrawledPage;
  }));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { if (r.value.chars > 150 && !pages.some((p) => p.url === r.value.url)) pages.push(r.value); }
    else warnings.push(`Couldn't read ${new URL(targets[i]).pathname}: ${r.reason instanceof WebFetchError ? r.reason.message : "failed"}`);
  });

  let budget = maxChars;
  const kept = pages.map((p) => { const text = p.text.slice(0, Math.max(0, Math.min(p.text.length, budget))); budget -= text.length; return { ...p, text }; }).filter((p) => p.text.length > 0);
  if (kept.reduce((n, p) => n + p.chars, 0) > maxChars) warnings.push("The site is large, so only the first part of it was read.");

  const total = kept.reduce((n, p) => n + p.text.length, 0);
  if (total < 400) warnings.push("Very little text was found. This site may load its content with JavaScript or sit behind a login, which CoursePilot can't read. Try a direct link to the schedule page.");
  return { pages: kept, warnings, startUrl: first.url };
}
