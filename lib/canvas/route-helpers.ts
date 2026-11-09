import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { userMessage } from "@/lib/utils/errors";
import { CanvasApiError, CanvasAuthError, CanvasConfigError, CanvasNotFoundError, CanvasRateLimitError } from "./client";

export async function requireRouteUser() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  return { supabase, user };
}

export function canvasErrorResponse(e: unknown) {
  if (e instanceof CanvasAuthError) return NextResponse.json({ error: e.message, code: "auth" }, { status: 401 });
  if (e instanceof CanvasConfigError) return NextResponse.json({ error: e.message, code: "config" }, { status: 400 });
  if (e instanceof CanvasRateLimitError) return NextResponse.json({ error: e.message, code: "rate_limit" }, { status: 429 });
  if (e instanceof CanvasNotFoundError) return NextResponse.json({ error: "Canvas couldn't find that. Check your school's Canvas URL.", code: "not_found" }, { status: 404 });
  if (e instanceof CanvasApiError) return NextResponse.json({ error: e.message, code: "api" }, { status: 502 });
  const msg = e instanceof Error ? e.message : "";
  // Missing encryption key etc. are configuration problems worth showing; internals are not.
  console.error("canvas route failed", e);
  return NextResponse.json({ error: /ENCRYPTION_KEY/.test(msg) ? msg : userMessage(e, "Something went wrong talking to Canvas. Please try again.") }, { status: /ENCRYPTION_KEY/.test(msg) ? 503 : 500 });
}
