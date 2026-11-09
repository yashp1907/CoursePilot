"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCourse } from "@/lib/actions/courses";
import { deleteCourse } from "@/lib/actions/courses";
import { uploadAndParse } from "@/lib/syllabus-upload";

/** Creates a course from a syllabus PDF: placeholder course -> upload -> Gemini extraction -> review on the course page. */
export function NewCourseFromSyllabus({ defaultSemester }: { defaultSemester?: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file?: File) {
    if (!file) return;
    setBusy(true);
    const name = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "New course";
    const created = await createCourse({ name, semester: defaultSemester ?? "" });
    if (!created.ok) { toast.error(created.error); setBusy(false); return; }
    const r = await uploadAndParse(created.data.id, file);
    if (input.current) input.current.value = "";
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      // Roll back the empty placeholder course if nothing was extracted, but only if it's still untouched.
      await deleteCourse(created.data.id);
      router.refresh();
      return;
    }
    toast.success("Syllabus extracted. Review it and apply it to the course.");
    router.push(`/courses/${created.data.id}?tab=syllabus`);
  }

  return (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Upload a syllabus to create a course" onChange={(e) => handle(e.target.files?.[0])} />
      <Button variant="outline" loading={busy} onClick={() => input.current?.click()}><FileUp /> {busy ? "Reading syllabus…" : "New from syllabus"}</Button>
    </>
  );
}
