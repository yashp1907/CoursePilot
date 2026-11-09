import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Opt-in timing (PERF_LOG=1): logs every database/auth call with its start offset and duration. Off by default. */
const t0 = Date.now();
const timedFetch: typeof fetch = async (input, init) => {
  const started = Date.now() - t0;
  const res = await fetch(input, init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  console.log(`[db] +${String(started).padStart(6)}ms  ${String(Date.now() - t0 - started).padStart(4)}ms  ${(init?.method ?? "GET").padEnd(4)} ${url.pathname.replace("/rest/v1/", "")}${url.search ? "?" + url.search.slice(1, 60) : ""}`);
  return res;
};

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...(process.env.PERF_LOG ? { global: { fetch: timedFetch } } : {}),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  });
}

export function isSupabaseConfigured() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
