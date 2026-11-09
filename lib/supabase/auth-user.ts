import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser { id: string; email: string | null }

/**
 * Who is signed in, WITHOUT a network round trip. `getClaims()` verifies the session token's signature locally
 * (asymmetric JWT keys) and refreshes an expired token when needed, so this costs ~1 ms instead of the ~200 ms
 * of `auth.getUser()`. The database independently enforces the same token through RLS on every query, so this
 * changes speed, not security. (Projects on legacy symmetric keys fall back to a server check inside getClaims.)
 */
export async function getAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? null };
}
