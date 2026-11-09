import { NextResponse, type NextRequest } from "next/server";
import { saveConnection } from "@/lib/canvas/connection";
import { requireRouteUser } from "@/lib/canvas/route-helpers";

export async function GET(request: NextRequest) {
  const { supabase, user } = await requireRouteUser();
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (q: string) => {
    const r = NextResponse.redirect(`${origin}/integrations?${q}`);
    r.cookies.delete({ name: "cp_canvas_state", path: "/api/canvas/oauth" });
    r.cookies.delete({ name: "cp_canvas_base", path: "/api/canvas/oauth" });
    return r;
  };
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = request.cookies.get("cp_canvas_state")?.value;
  const base = request.cookies.get("cp_canvas_base")?.value;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("error=Canvas%20login%20was%20cancelled.");
  if (!state || !base || !code || state !== url.searchParams.get("state")) return back("error=Canvas%20login%20couldn%27t%20be%20verified.%20Please%20try%20again.");

  try {
    const res = await fetch(`${base}/login/oauth2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.CANVAS_CLIENT_ID!, client_secret: process.env.CANVAS_CLIENT_SECRET!, redirect_uri: process.env.CANVAS_REDIRECT_URI!, code }),
    });
    if (!res.ok) return back("error=Canvas%20refused%20the%20login.");
    const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    await saveConnection(supabase, user.id, base, "oauth", { access: j.access_token, refresh: j.refresh_token, expiresInSec: j.expires_in });
    return back("connected=1");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error && /ENCRYPTION_KEY/.test(e.message) ? "Server is missing CANVAS_TOKEN_ENCRYPTION_KEY." : "Couldn't save the Canvas connection.")}`);
  }
}
