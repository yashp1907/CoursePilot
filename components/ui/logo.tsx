import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
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
