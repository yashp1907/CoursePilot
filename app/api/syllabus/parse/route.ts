import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { generateStructured, GeminiConfigError } from "@/lib/ai/gemini";
import { syllabusExtractionSchema } from "@/lib/ai/schemas";
import { SYLLABUS_SYSTEM_PROMPT, syllabusUserPrompt } from "@/lib/ai/prompts";
import { userMessage } from "@/lib/utils/errors";

export const maxDuration = 60;
export const runtime = "nodejs";

const bodySchema = z.object({
  courseId: z.string().uuid(),
  storagePath: z.string().min(3).max(300),
  fileName: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { courseId, storagePath, fileName } = body.data;

  // The file must live in this user's folder and the course must be theirs (RLS also enforces both).
  if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes("..")) {
    return NextResponse.json({ error: "Invalid file location." }, { status: 403 });
  }
  const { data: course } = await supabase.from("courses").select("id, name, semester").eq("id", courseId).maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const { data: prev } = await supabase.from("syllabi").select("id, storage_path, status, updated_at").eq("course_id", courseId).maybeSingle();
  if (prev?.status === "extracting" && Date.now() - new Date(prev.updated_at).getTime() < 90_000) {
    return NextResponse.json({ error: "This syllabus is already being processed. Give it a minute." }, { status: 409 });
  }

  const { error: upErr } = await supabase.from("syllabi").upsert(
    { user_id: user.id, course_id: courseId, storage_path: storagePath, file_name: fileName, status: "extracting", error: null, extracted: null, applied_at: null },
    { onConflict: "course_id" },
  );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Replacing a syllabus: remove the old file after the new row points at the new one.
  if (prev?.storage_path && prev.storage_path !== storagePath) await supabase.storage.from("syllabi").remove([prev.storage_path]);

  const fail = async (message: string, status = 502) => {
    await supabase.from("syllabi").update({ status: "failed", error: message }).eq("course_id", courseId);
    return NextResponse.json({ error: message }, { status });
  };

  const { data: blob, error: dlErr } = await supabase.storage.from("syllabi").download(storagePath);
  if (dlErr || !blob) return fail("Couldn't read the uploaded file from storage.", 500);
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("That file doesn't look like a valid PDF.", 400);

  try {
    const { data, model } = await generateStructured({
      schema: syllabusExtractionSchema,
      system: SYLLABUS_SYSTEM_PROMPT,
      prompt: syllabusUserPrompt({ today: new Date().toISOString().slice(0, 10), courseHint: course.name, semesterHint: course.semester }),
      files: [{ mimeType: "application/pdf", data: buf }],
    });
    await supabase.from("syllabi").update({ status: "extracted", extracted: data, model, error: null }).eq("course_id", courseId);
    await supabase.from("activity_log").insert({ user_id: user.id, course_id: courseId, kind: "syllabus_uploaded", message: `Syllabus parsed for ${course.name}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("syllabus parse failed", e);
    const msg = userMessage(e, "We couldn't read that syllabus. Please try again, or add the details manually.");
    return fail(msg, e instanceof GeminiConfigError ? 503 : 502);
  }
}
