import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface PageLink { text: string; href: string }
export interface ParsedPage { title: string; text: string; links: PageLink[] }

const SKIP = new Set(["script", "style", "noscript", "svg", "template", "head", "iframe", "canvas", "button", "select", "option", "form"]);
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "main", "aside", "ul", "ol", "dl", "dt", "dd", "blockquote", "pre", "details", "summary", "figure", "tr", "nav"]);

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try { const u = new URL(href, base); if (u.protocol !== "https:" && u.protocol !== "http:") return null; u.hash = ""; return u.toString(); } catch { return null; }
}

/**
 * Turn HTML into compact text a model can read reliably: headings as "## ", lists as "- ", tables as
 * "cell | cell | cell" rows (so schedule columns stay aligned) and links inline as [text](url).
 */
export function parseHtml(html: string, baseUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    const href = absolute($(el).attr("href"), baseUrl);
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (href) links.push({ text, href });
  });

  const hidden = (el: Element) => el.attribs?.hidden !== undefined || /display\s*:\s*none/i.test(el.attribs?.style ?? "") || el.attribs?.["aria-hidden"] === "true";

  const walk = (node: AnyNode): string => {
    if (node.type === "text") return (node as unknown as { data: string }).data.replace(/\s+/g, " ");
    if (node.type !== "tag") return "";
    const el = node as Element;
    const name = el.name.toLowerCase();
    if (SKIP.has(name) || hidden(el)) return "";
    const inner = () => el.children.map(walk).join("");
    if (name === "br") return "\n";
    if (name === "a") {
      const text = inner().replace(/\s+/g, " ").trim();
      const href = absolute(el.attribs?.href, baseUrl);
      return text && href ? `[${text}](${href})` : text;
    }
    if (/^h[1-6]$/.test(name)) return `\n\n## ${inner().replace(/\s+/g, " ").trim()}\n`;
    if (name === "li") return `\n- ${inner().trim()}`;
    if (name === "table") {
      const rows = $(el).find("tr").toArray().map((tr) => {
        const cells = $(tr).children("th,td").toArray().map((c) => walkInline(c).replace(/\s+/g, " ").trim());
        return cells.join(" | ").trim();
      }).filter((r) => r.replace(/[|\s]/g, ""));
      return `\n${rows.join("\n")}\n`;
    }
    if (BLOCK.has(name)) return `\n${inner()}\n`;
    return inner();
  };
  const walkInline = (el: AnyNode): string => (el.type === "tag" ? (el as Element).children.map(walk).join("") : walk(el));

  const body = $("body").get(0);
  const raw = body ? (body as Element).children.map(walk).join("") : "";
  const text = raw.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title: $("title").first().text().replace(/\s+/g, " ").trim(), text, links };
}
