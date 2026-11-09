"use client";
import { NavLink } from "@/components/ui/nav-link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/utils";

export type TabKey = "overview" | "assignments" | "grades" | "info" | "syllabus" | "website" | "assistant";
const TABS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Overview" }, { value: "assignments", label: "Assignments" }, { value: "grades", label: "Grades" }, { value: "info", label: "Course info" },
  { value: "syllabus", label: "Syllabus" }, { value: "website", label: "Course site" }, { value: "assistant", label: "AI Assistant" },
];

export function TabSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-56 lg:col-span-2" /><Skeleton className="h-56" /></div>
      <Skeleton className="h-40" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Tabs are real links (each loads only its own data on the server). Clicking highlights the tab and swaps in a skeleton
 * IMMEDIATELY, so the UI responds in a frame while the server works. Previously-visited tabs come from the router cache.
 */
export function CourseTabs({ active, children }: { active: TabKey; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<TabKey | null>(null);
  const shown = pending && target ? target : active;

  return (
    <div>
      <div role="tablist" aria-label="Course sections" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const href = `${pathname}?tab=${t.value}`;
          return (
            <NavLink key={t.value} href={href} scroll={false} role="tab" aria-selected={shown === t.value}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;     // let "open in new tab" work
                e.preventDefault();
                if (t.value === shown) return;
                setTarget(t.value);
                start(() => router.push(href, { scroll: false }));
              }}
              className={cn("whitespace-nowrap rounded-t-md px-3.5 py-2.5 text-sm font-medium transition-colors", shown === t.value ? "text-primary shadow-[inset_0_-2px_0_0_var(--primary)]" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              {t.label}
            </NavLink>
          );
        })}
      </div>
      <div className="pt-5" role="tabpanel">{pending ? <TabSkeleton /> : children}</div>
    </div>
  );
}
