import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { normalizeCanvasBaseUrl } from "@/lib/canvas/client";
import { upsertConnection } from "@/lib/canvas/connection";
import { PayloadSource, ingestSchema } from "@/lib/canvas/source";
import { runCanvasSync } from "@/lib/canvas/sync";
import { canvasErrorResponse, requireRouteUser } from "@/lib/canvas/route-helpers";

export const maxDuration = 60;

/**
 * Receives Canvas data fetched by the CoursePilot browser extension (via the student's own Canvas session)
 * and reconciles it with exactly the same logic as a token/OAuth sync. No Canvas credentials are involved.
 * The route only ever writes to the signed-in student's own rows (RLS).
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireRouteUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const parsed = ingestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "The Canvas data from the extension was malformed.", code: "bad_payload" }, { status: 400 });

  try {
    const baseUrl = normalizeCanvasBaseUrl(parsed.data.baseUrl);
    const { data: running } = await supabase.from("canvas_sync_history").select("id").eq("status", "running").gte("started_at", new Date(Date.now() - 90_000).toISOString()).limit(1);
    if (running?.length) return NextResponse.json({ error: "A sync is already running. Give it a moment.", code: "busy" }, { status: 409 });

    let conn: { id: string };
    try {
      conn = await upsertConnection(supabase, user.id, baseUrl, { auth_type: "extension", access_token_enc: null, refresh_token_enc: null, token_expires_at: null });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      const hint = /auth_type|check constraint/i.test(m) ? "The database needs the latest migration (…0003_canvas_extension.sql)." : m || "Couldn't save the Canvas connection.";
      return NextResponse.json({ error: hint }, { status: 503 });
    }

    const summary = await runCanvasSync({ supabase, userId: user.id, connectionId: conn.id, client: new PayloadSource(parsed.data.courses), timeZone: parsed.data.timeZone });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, summary });
  } catch (e) { return canvasErrorResponse(e); }
}
