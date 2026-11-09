import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasClient, CanvasConfigError, normalizeCanvasBaseUrl } from "./client";
import { decryptSecret, encryptSecret } from "./crypto";

export interface CanvasConnectionRow { id: string; base_url: string; auth_type: "oauth" | "token"; status: string; last_synced_at: string | null; token_expires_at: string | null }

export const canvasOAuthConfigured = () => !!(process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET && process.env.CANVAS_REDIRECT_URI);

export async function getConnection(supabase: SupabaseClient): Promise<CanvasConnectionRow | null> {
  const { data } = await supabase.from("canvas_connections").select("id, base_url, auth_type, status, last_synced_at, token_expires_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as CanvasConnectionRow | null) ?? null;
}

/** Build an authenticated client. Refreshes an expiring OAuth token first. Secrets never leave the server. */
export async function clientForConnection(supabase: SupabaseClient, connectionId: string): Promise<CanvasClient> {
  const { data, error } = await supabase.rpc("canvas_secrets", { p_connection: connectionId });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.access_token_enc) throw new CanvasConfigError("Your Canvas connection is missing its credentials. Please reconnect.");
  let token = decryptSecret(row.access_token_enc as string);
  const expires = row.token_expires_at ? new Date(row.token_expires_at as string) : null;

  if (row.auth_type === "oauth" && expires && expires.getTime() - Date.now() < 60_000) {
    if (!row.refresh_token_enc || !canvasOAuthConfigured()) {
      await supabase.from("canvas_connections").update({ status: "expired" }).eq("id", connectionId);
      throw new CanvasConfigError("Your Canvas session expired. Please reconnect.");
    }
    const res = await fetch(`${row.base_url}/login/oauth2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.CANVAS_CLIENT_ID!, client_secret: process.env.CANVAS_CLIENT_SECRET!, refresh_token: decryptSecret(row.refresh_token_enc as string) }),
    });
    if (!res.ok) {
      await supabase.from("canvas_connections").update({ status: "expired" }).eq("id", connectionId);
      throw new CanvasConfigError("Canvas refused to renew your session. Please reconnect.");
    }
    const j = (await res.json()) as { access_token: string; expires_in?: number };
    token = j.access_token;
    await supabase.from("canvas_connections").update({ access_token_enc: encryptSecret(token), token_expires_at: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(), status: "active" }).eq("id", connectionId);
  }
  return new CanvasClient({ baseUrl: row.base_url as string, token });
}

/** Validate a pasted access token against Canvas, then store it encrypted. */
export async function saveTokenConnection(supabase: SupabaseClient, userId: string, baseUrlInput: string, token: string) {
  const baseUrl = normalizeCanvasBaseUrl(baseUrlInput);
  const t = token.trim();
  if (t.length < 20) throw new CanvasConfigError("That doesn't look like a Canvas access token.");
  const me = await new CanvasClient({ baseUrl, token: t }).self(); // throws CanvasAuthError if invalid
  await saveConnection(supabase, userId, baseUrl, "token", { access: t });
  return { baseUrl, name: me.name ?? null };
}

/**
 * Create or update the student's connection for a Canvas host.
 * Deliberately NOT a Postgres upsert: ON CONFLICT DO UPDATE needs SELECT on every column it writes, and the
 * encrypted token columns are intentionally unreadable to clients. So: look up by host, then update or insert.
 */
export async function upsertConnection(supabase: SupabaseClient, userId: string, baseUrl: string, fields: { auth_type: "oauth" | "token" | "extension"; access_token_enc: string | null; refresh_token_enc: string | null; token_expires_at: string | null }): Promise<{ id: string }> {
  const { data: existing, error: se } = await supabase.from("canvas_connections").select("id").eq("base_url", baseUrl).maybeSingle();
  if (se) throw new Error(se.message);
  const row = { ...fields, status: "active" };
  if (existing) {
    const { error } = await supabase.from("canvas_connections").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id as string };
  }
  const { data, error } = await supabase.from("canvas_connections").insert({ user_id: userId, base_url: baseUrl, ...row }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the Canvas connection.");
  return { id: data.id as string };
}

export async function saveConnection(supabase: SupabaseClient, userId: string, baseUrl: string, authType: "oauth" | "token", s: { access: string; refresh?: string; expiresInSec?: number }) {
  return upsertConnection(supabase, userId, baseUrl, {
    auth_type: authType, access_token_enc: encryptSecret(s.access), refresh_token_enc: s.refresh ? encryptSecret(s.refresh) : null,
    token_expires_at: s.expiresInSec ? new Date(Date.now() + s.expiresInSec * 1000).toISOString() : null,
  });
}
