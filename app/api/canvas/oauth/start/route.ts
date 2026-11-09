import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { canvasOAuthConfigured } from "@/lib/canvas/connection";
import { CanvasConfigError, normalizeCanvasBaseUrl } from "@/lib/canvas/client";
import { requireRouteUser } from "@/lib/canvas/route-helpers";

export async function GET(request: NextRequest) {
  const { user } = await requireRouteUser();
  const origin = new URL(request.url).origin;
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!canvasOAuthConfigured()) return NextResponse.redirect(`${origin}/integrations?error=oauth_not_configured`);
  try {
    const base = normalizeCanvasBaseUrl(new URL(request.url).searchParams.get("baseUrl") || process.env.CANVAS_BASE_URL || "");
    const state = randomBytes(24).toString("base64url");
    const url = new URL(`${base}/login/oauth2/auth`);
    url.searchParams.set("client_id", process.env.CANVAS_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", process.env.CANVAS_REDIRECT_URI!);
    url.searchParams.set("state", state);
    const res = NextResponse.redirect(url.toString());
    const opts = { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax" as const, maxAge: 600, path: "/api/canvas/oauth" };
    res.cookies.set("cp_canvas_state", state, opts);
    res.cookies.set("cp_canvas_base", base, opts);
    return res;
  } catch (e) {
    const msg = e instanceof CanvasConfigError ? e.message : "Couldn't start Canvas login.";
    return NextResponse.redirect(`${origin}/integrations?error=${encodeURIComponent(msg)}`);
  }
}
