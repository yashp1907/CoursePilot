import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clientForConnection, getConnection } from "@/lib/canvas/connection";
import { runCanvasSync } from "@/lib/canvas/sync";
import { canvasErrorResponse, requireRouteUser } from "@/lib/canvas/route-helpers";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireRouteUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const body = z.object({ timeZone: z.string().max(64).default("UTC"), courseId: z.string().uuid().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const conn = await getConnection(supabase);
  if (!conn) return NextResponse.json({ error: "Canvas isn't connected yet.", code: "not_connected" }, { status: 400 });

  // Don't let a double-click or two tabs run overlapping syncs.
  const { data: running } = await supabase.from("canvas_sync_history").select("id").eq("status", "running").gte("started_at", new Date(Date.now() - 90_000).toISOString()).limit(1);
  if (running?.length) return NextResponse.json({ error: "A sync is already running. Give it a moment.", code: "busy" }, { status: 409 });

  try {
    const client = await clientForConnection(supabase, conn.id);
    const summary = await runCanvasSync({ supabase, userId: user.id, connectionId: conn.id, client, timeZone: body.data.timeZone, onlyCourseId: body.data.courseId });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, summary });
  } catch (e) { return canvasErrorResponse(e); }
}
