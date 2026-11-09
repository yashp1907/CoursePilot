import { cn } from "@/lib/utils";
import { readable, tint } from "@/lib/utils/colors";

/** The course's code in its own color. The one consistent way a course is labeled in lists, boards and tables. */
export function CourseChip({ color, label, className }: { color: string | null | undefined; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-xs font-semibold", className)} style={{ backgroundColor: tint(color, 14), color: readable(color) }}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "currentColor" }} />
      <span className="truncate">{label}</span>
    </span>
  );
}
