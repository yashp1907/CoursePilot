"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadAndParse } from "@/lib/syllabus-upload";
import { cn } from "@/lib/utils";

export function SyllabusDropzone({ courseId, label = "Upload syllabus PDF", compact }: { courseId: string; label?: string; compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "uploading">("idle");
  const [drag, setDrag] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy("uploading");
    const r = await uploadAndParse(courseId, file);
    setBusy("idle");
    if (input.current) input.current.value = "";
    if (r.ok) toast.success("Syllabus extracted. Review the results below.");
    else toast.error(r.error);
    router.refresh();
  }

  const body = busy === "uploading"
    ? <><Loader2 className="size-5 animate-spin text-primary" /><p className="text-sm font-medium">Reading your syllabus…</p><p className="text-xs text-muted-foreground">This usually takes 10–30 seconds.</p></>
    : <><FileUp className="size-5 text-muted-foreground" /><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">PDF up to 10 MB. Drag and drop, or click to browse.</p></>;

  return (
    <>
      <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={label} onChange={(e) => handle(e.target.files?.[0])} />
      {compact ? (
        <Button variant="outline" onClick={() => input.current?.click()} loading={busy === "uploading"}><FileUp /> {busy === "uploading" ? "Processing…" : label}</Button>
      ) : (
        <button type="button" disabled={busy === "uploading"} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
          className={cn("flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer hover:bg-accent/40", drag && "border-primary bg-primary-soft/50")}>
          {body}
        </button>
      )}
    </>
  );
}
