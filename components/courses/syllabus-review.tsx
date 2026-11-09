"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { SyllabusDropzone } from "./syllabus-dropzone";
import { ExtractionEditor } from "./extraction-editor";
import { applySyllabus, saveSyllabusExtraction } from "@/lib/actions/syllabus";
import { createClient } from "@/lib/supabase/client";
import { cleanStored } from "@/lib/utils/errors";
import { syllabusExtractionSchema, type SyllabusExtraction } from "@/lib/ai/schemas";
import type { Assignment, Syllabus } from "@/types/database";

function parseExtraction(s: Syllabus | null): SyllabusExtraction | null {
  const p = s?.extracted ? syllabusExtractionSchema.safeParse(s.extracted) : null;
  return p?.success ? p.data : null;
}

export function SyllabusReview({ courseId, syllabus, existing }: { courseId: string; syllabus: Syllabus | null; existing: Assignment[] }) {
  const router = useRouter();
  const ex = parseExtraction(syllabus);

  async function viewPdf() {
    if (!syllabus) return;
    const { data, error } = await createClient().storage.from("syllabi").createSignedUrl(syllabus.storage_path, 300);
    if (error || !data) return toast.error("Couldn't open the PDF.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  if (!syllabus) {
    return (
      <div className="space-y-4">
        <SyllabusDropzone courseId={courseId} />
        <p className="text-sm text-muted-foreground">CoursePilot reads your syllabus with Gemini and extracts course details, grading weights, dates, and policies. You review everything before it&apos;s saved to the course.</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{syllabus.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {syllabus.status === "applied" ? "Applied to course" : syllabus.status === "extracted" ? "Extracted, awaiting your review" : syllabus.status === "failed" ? "Extraction failed" : "Processing"}
            {syllabus.model ? ` · ${syllabus.model}` : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={viewPdf}><ExternalLink /> View PDF</Button>
        <SyllabusDropzone courseId={courseId} compact label="Replace PDF" />
      </div>
    </div>
  );

  if (syllabus.status === "failed" || !ex) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-red-500/5 p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">We couldn&apos;t extract this syllabus.</p>
            <p className="mt-0.5 text-muted-foreground">{cleanStored(syllabus.error, "The extracted data was missing or unreadable.")} You can try a different PDF, or add course details and assignments manually.</p>
          </div>
        </div>
      </div>
    );
  }
  if (syllabus.status === "extracting") {
    return <div className="space-y-4">{header}<EmptyState icon={<Sparkles />} title="Still reading this syllabus" description="Refresh in a few seconds. If it stays stuck for more than a minute, upload the PDF again." action={<Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>} /></div>;
  }

  return (
    <div className="space-y-5">
      {header}
      <ExtractionEditor courseId={courseId} initial={ex} resetKey={syllabus.updated_at} existing={existing} applied={syllabus.status === "applied"}
        onSave={saveSyllabusExtraction} onApply={applySyllabus} />
    </div>
  );
}
