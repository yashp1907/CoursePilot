import dns from "node:dns";
import net from "node:net";

export class WebFetchError extends Error {
  constructor(message: string, readonly code: "invalid_url" | "blocked" | "http" | "unsupported" | "too_large" | "timeout" | "network" | "robots" | "login" = "network") { super(message); }
}

/** Private, loopback, link-local and other non-public addresses a server must never be tricked into fetching. */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true; // not an IP at all: treat as unsafe
}

/** Only https URLs on public hostnames. Rejects credentials, IP literals, and local names. */
export function validatePublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new WebFetchError("That doesn't look like a valid web address.", "invalid_url"); }
  if (u.protocol !== "https:") throw new WebFetchError("Course website addresses must start with https://", "invalid_url");
  if (u.username || u.password) throw new WebFetchError("Don't include a username or password in the address.", "invalid_url");
  const host = u.hostname.toLowerCase();
  if (net.isIP(host) || host.startsWith("[") || !host.includes(".") || /\.(local|internal|localhost|lan|home|corp)$/.test(host) || host === "localhost") {
    throw new WebFetchError("Use the course site's public web address (not an IP address or local name).", "blocked");
  }
  u.hash = "";
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/** DNS lookup that refuses private addresses at connection time, so a hostname can't be rebound to an internal IP. */
export function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) return cb(Object.assign(new Error("Blocked: that address resolves to a private network."), { code: "EBLOCKED" }) as NodeJS.ErrnoException);
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

let agent: unknown;
async function getAgent() {
  if (!agent) { const { Agent } = await import("undici"); agent = new Agent({ connect: { lookup: safeLookup as never }, headersTimeout: 10_000, bodyTimeout: 10_000 }); }
  return agent;
}

export interface FetchedText { url: string; contentType: string; text: string; status: number }
export interface SafeFetchOptions { fetchImpl?: typeof fetch; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; userAgent?: string }

export const USER_AGENT = "CoursePilotBot/1.0 (student planner; fetches a course page only when its owner asks)";

/** Fetch a public page as text with SSRF protection, size and time limits, and re-validated redirects. */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchedText> {
  const maxBytes = opts.maxBytes ?? 2_000_000, timeoutMs = opts.timeoutMs ?? 12_000, maxRedirects = opts.maxRedirects ?? 4;
  let url = validatePublicUrl(rawUrl);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const init: Record<string, unknown> = { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": opts.userAgent ?? USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" } };
      if (!opts.fetchImpl) init.dispatcher = await getAgent();
      const res = await (opts.fetchImpl ?? fetch)(url.toString(), init as RequestInit);
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = validatePublicUrl(new URL(res.headers.get("location")!, url).toString());
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new WebFetchError("This page needs a login (or blocks automated readers), so CoursePilot can't read it.", "login");
      if (!res.ok) throw new WebFetchError(`The site returned an error (${res.status}).`, "http");
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (type && !/(text\/html|application\/xhtml|text\/plain)/.test(type)) throw new WebFetchError(`That link isn't a web page (${type.split(";")[0]}).`, "unsupported");
      const len = Number(res.headers.get("content-length"));
      if (len > maxBytes) throw new WebFetchError("That page is too large to read.", "too_large");
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { ctl.abort(); throw new WebFetchError("That page is too large to read.", "too_large"); }
          chunks.push(value);
        }
      }
      return { url: url.toString(), contentType: type, status: res.status, text: new TextDecoder("utf-8").decode(Buffer.concat(chunks)) };
    } catch (e) {
      if (e instanceof WebFetchError) throw e;
      const err = e as { name?: string; cause?: { code?: string }; code?: string; message?: string };
      if (err.name === "AbortError") throw new WebFetchError("The site took too long to respond.", "timeout");
      if (err.cause?.code === "EBLOCKED" || err.code === "EBLOCKED" || /Blocked:/.test(err.message ?? "")) throw new WebFetchError("That address points to a private network, so it was blocked.", "blocked");
      throw new WebFetchError("Couldn't reach that site. Check the address and try again.", "network");
    } finally { clearTimeout(timer); }
  }
  throw new WebFetchError("The site redirected too many times.", "http");
}

/** Does robots.txt allow a generic bot to read this path? (Simple, conservative: only User-agent: * groups.) */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  let applies = false, rules: { allow: boolean; path: string }[] = [];
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") applies = v === "*" || /coursepilot/i.test(v);
    else if (applies && (k === "disallow" || k === "allow") && v) rules.push({ allow: k === "allow", path: v });
  }
  rules = rules.filter((r) => path.startsWith(r.path.replace(/\*.*$/, "").replace(/\$$/, "")));
  if (!rules.length) return true;
  const best = rules.sort((a, b) => b.path.length - a.path.length)[0];
  return best.allow;
}
