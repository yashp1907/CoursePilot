import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a gradient defined inside a display:none copy (e.g. the desktop sidebar) can't be referenced by visible ones.
  const gid = `lg${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--primary) 80%, white)" }} /><stop offset="1" style={{ stopColor: "var(--primary)" }} /></linearGradient></defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      <path d="M8 21.5 16 7l8 14.5-8-3.2-8 3.2Z" fill="var(--primary-foreground)" />
      <path d="M16 18.3V7" stroke="var(--primary)" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7" />
      <span className="text-[15px] font-semibold tracking-tight">CoursePilot</span>
    </span>
  );
}
