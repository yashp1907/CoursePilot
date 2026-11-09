import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { saveTokenConnection } from "@/lib/canvas/connection";
import { canvasErrorResponse, requireRouteUser } from "@/lib/canvas/route-helpers";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireRouteUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const body = z.object({ baseUrl: z.string().min(1).max(200), token: z.string().min(1).max(500) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter your Canvas URL and access token." }, { status: 400 });
  try {
    const r = await saveTokenConnection(supabase, user.id, body.data.baseUrl, body.data.token);
    return NextResponse.json({ ok: true, baseUrl: r.baseUrl, name: r.name });
  } catch (e) { return canvasErrorResponse(e); }
}
