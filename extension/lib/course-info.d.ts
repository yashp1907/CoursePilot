export interface RawPerson { name: string; role: string; base_role?: "teacher" | "ta" | "designer"; email: string | null; bio: string | null }
export interface RawCourseInfo {
  syllabus_text: string | null;
  pages: { title: string; url: string | null; text: string; front?: boolean }[];
  people: RawPerson[];
  sections: { name: string; start: string | null; end: string | null }[];
  events: { title: string; start: string | null; end: string | null; all_day: boolean; location: string | null; description: string | null }[];
  tabs: { label: string; url: string | null; external: boolean }[];
  modules: { name: string; items: string[] }[];
}
export function htmlToText(html: string | null | undefined, baseUrl: string): string;
export const LIMITS: Record<string, number>;
export function collectCourseInfo(session: { get(path: string, params?: Record<string, unknown>): Promise<any>; paginate(path: string, params?: Record<string, unknown>, maxPages?: number): Promise<any[]> }, courseId: string | number, opts?: { baseUrl: string; now?: Date }): Promise<RawCourseInfo>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function hasAnyInfo(raw: RawCourseInfo | null | undefined): boolean;
