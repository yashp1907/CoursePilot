export class NotLoggedInError extends Error { code: string }
export function parseCanvasJson(text: string): unknown;
export function nextLink(header: string | null): string | null;
export interface Session { origin: string; get(path: string, params?: Record<string, unknown>): Promise<any>; paginate(path: string, params?: Record<string, unknown>, maxPages?: number): Promise<any[]> } // eslint-disable-line @typescript-eslint/no-explicit-any
export function createSession(origin: string, opts?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; gapMs?: number; maxRetries?: number }): Session;
export function fetchAllCanvasData(session: Session, onProgress?: (p: { step: number; total: number; label: string }) => void, now?: Date): Promise<{ user: string | null; courses: { course: any; groups: any[]; assignments: any[]; announcements: any[]; error?: string }[] }>; // eslint-disable-line @typescript-eslint/no-explicit-any
