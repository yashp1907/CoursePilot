import { createClient } from "@/lib/supabase/client";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Upload a PDF to the user's private folder, then ask the server to parse it with Gemini. */
export async function uploadAndParse(courseId: string, file: File): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return { ok: false, error: "Please choose a PDF file." };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "That PDF is over 10 MB. Try a smaller or compressed copy." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const storagePath = `${user.id}/${courseId}/${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage.from("syllabi").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    const res = await fetch("/api/syllabus/parse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, storagePath, fileName: file.name }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? "Syllabus extraction failed." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while processing the syllabus." };
  }
}
