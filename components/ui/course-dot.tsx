import { courseHex } from "@/lib/utils/colors";

export function CourseDot({ color, className }: { color: string; className?: string }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${className ?? ""}`} style={{ backgroundColor: courseHex(color) }} aria-hidden />;
}
