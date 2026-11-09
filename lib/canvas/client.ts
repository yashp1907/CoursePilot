import { collectCourseInfo, hasAnyInfo } from "../../extension/lib/course-info.js";
import { rawCourseInfoSchema, type RawInfo } from "@/lib/course-info/schemas";
import type { CanvasAnnouncement, CanvasAssignment, CanvasAssignmentGroup, CanvasCourse } from "./types";

export class CanvasAuthError extends Error { constructor(m = "Canvas rejected the access token. It may have expired or been revoked.") { super(m); } }
export class CanvasNotFoundError extends Error {}
export class CanvasRateLimitError extends Error {}
export class CanvasApiError extends Error { constructor(m: string, readonly status: number) { super(m); } }
export class CanvasConfigError extends Error {}

/**
 * Normalize and validate a user-supplied Canvas URL. The server will call this host with the user's token,
 * so refuse anything that isn't a public https hostname (basic SSRF protection).
 */
export function normalizeCanvasBaseUrl(input: string, opts: { allowInsecureLocal?: boolean } = {}): string {
  let raw = input.trim();
  if (!raw) throw new CanvasConfigError("Enter your school's Canvas URL, e.g. https://canvas.university.edu");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try { u = new URL(raw); } catch { throw new CanvasConfigError("That doesn't look like a valid URL."); }
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host.endsWith(".localhost");
  if (local && opts.allowInsecureLocal) return u.origin;
  if (u.protocol !== "https:") throw new CanvasConfigError("Canvas URLs must use https.");
  if (u.username || u.password) throw new CanvasConfigError("Don't include credentials in the URL.");
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (ipv4 || host.includes(":") || host.startsWith("[") || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || local) {
    throw new CanvasConfigError("Use your school's public Canvas hostname (not an IP address or local name).");
  }
  return u.origin;
}

/** Extract the rel="next" URL from a Canvas `Link` header. */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}

export interface CanvasClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

type Params = Record<string, string | number | boolean | (string | number)[] | undefined>;

export class CanvasClient {
  private base: string;
  private token: string;
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;
  constructor(o: CanvasClientOptions) {
    this.base = o.baseUrl.replace(/\/$/, "");
    this.token = o.token;
    this.f = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = o.maxRetries ?? 3;
  }

  private url(path: string, params?: Params): string {
    const u = new URL(path.startsWith("http") ? path : `${this.base}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k.endsWith("[]") ? k : `${k}[]`, String(x)));
      else u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  private async request(url: string): Promise<Response> {
    // Never send the token anywhere except the configured Canvas host.
    if (new URL(url).origin !== new URL(this.base).origin) throw new CanvasApiError("Refusing to follow a link to a different host.", 0);
    for (let attempt = 0; ; attempt++) {
      const res = await this.f(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json+canvas-string-ids, application/json" }, redirect: "error" });
      if (res.status === 401) throw new CanvasAuthError();
      const body403 = res.status === 403 ? await res.clone().text().catch(() => "") : "";
      const limited = res.status === 429 || (res.status === 403 && /rate limit/i.test(body403));
      if (limited) {
        if (attempt >= this.maxRetries) throw new CanvasRateLimitError("Canvas is rate limiting requests. Try again in a few minutes.");
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 404) throw new CanvasNotFoundError(`Not found: ${new URL(url).pathname}`);
      if (res.status >= 500 && attempt < this.maxRetries) { await this.sleep(500 * 2 ** attempt); continue; }
      if (!res.ok) throw new CanvasApiError(`Canvas returned ${res.status} for ${new URL(url).pathname}`, res.status);
      return res;
    }
  }

  async get<T>(path: string, params?: Params): Promise<T> {
    return (await (await this.request(this.url(path, params))).json()) as T;
  }

  /** Follow pagination to the end (bounded by maxPages). */
  async paginate<T>(path: string, params?: Params, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = this.url(path, { per_page: 100, ...params });
    for (let page = 0; next && page < maxPages; page++) {
      const res = await this.request(next);
      const data = (await res.json()) as T[] | T;
      if (Array.isArray(data)) out.push(...data);
      next = parseNextLink(res.headers.get("link"));
    }
    return out;
  }

  /** Syllabus tab, home page, key pages, staff, sections, calendar, tabs and modules for one course (staff only: no student data). */
  async courseInfo(courseId: number | string): Promise<RawInfo | null> {
    const raw = await collectCourseInfo(this as never, courseId, { baseUrl: this.base });
    return hasAnyInfo(raw) ? rawCourseInfoSchema.parse(raw) : null;
  }

  self() { return this.get<{ id: number; name?: string }>("/api/v1/users/self"); }
  courses() { return this.paginate<CanvasCourse>("/api/v1/courses", { enrollment_state: "active", "include[]": ["term", "total_scores"] }); }
  assignmentGroups(courseId: number | string) { return this.paginate<CanvasAssignmentGroup>(`/api/v1/courses/${courseId}/assignment_groups`, { "include[]": ["rules"] }); }
  assignments(courseId: number | string) { return this.paginate<CanvasAssignment>(`/api/v1/courses/${courseId}/assignments`, { "include[]": ["submission"], order_by: "due_at" }); }
  announcements(courseId: number | string, sinceIso: string) {
    return this.paginate<CanvasAnnouncement>("/api/v1/announcements", { "context_codes[]": [`course_${courseId}`], start_date: sinceIso.slice(0, 10), active_only: true }, 3);
  }
}
