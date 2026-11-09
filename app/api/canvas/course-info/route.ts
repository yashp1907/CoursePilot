import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { GeminiConfigError } from "@/lib/ai/gemini";
import { processCourseInfo } from "@/lib/server/course-info";
import { requireRouteUser } from "@/lib/canvas/route-helpers";
import { userMessage } from "@/lib/utils/errors";

export const maxDuration = 60;

/** Understand the next pending course's Canvas pages (or one specific course). Call repeatedly until `remaining` is 0. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireRouteUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const body = z.object({ courseId: z.string().uuid().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const r = await processCourseInfo(supabase, { courseId: body.data.courseId });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (/course_info|schema cache|relation/.test(m)) return NextResponse.json({ error: "The database needs the latest migration (…0006_course_info.sql)." }, { status: 503 });
    console.error("course-info route failed", e);
    return NextResponse.json({ error: userMessage(e, "We couldn't read the course pages. Please try again in a moment.") }, { status: e instanceof GeminiConfigError ? 503 : 502 });
  }
}
