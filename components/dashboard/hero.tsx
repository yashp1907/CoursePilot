"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { countdown, URGENCY_STYLE } from "@/lib/utils/countdown";
import { courseHex, readable, tint } from "@/lib/utils/colors";

export interface NextUp { title: string; dueAt: string; type: string; courseLabel: string; color: string }

const greeting = (h: number) => (h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Greeting + the single most important thing right now. Time-aware, so it renders on the client's clock. */
export function Hero({ name, summary, next, overdueCount }: { name?: string; summary: React.ReactNode; next: NextUp | null; overdueCount: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const t = () => setNow(new Date()); t(); const id = setInterval(t, 60_000); return () => clearInterval(id); }, []);
  const cd = next && now ? countdown(next.dueAt, now) : null;
  return (
    <section className="aurora rounded-2xl border bg-card shadow-[var(--shadow-card)] anim-rise">
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground" suppressHydrationWarning>{now ? format(now, "EEEE, MMMM d") : " "}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight" suppressHydrationWarning>{now ? greeting(now.getHours()) : "Welcome back"}{name ? `, ${name}` : ""}</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{summary}</p>
        </div>
        {next && (
          <Link href="/assignments" className="spotlight group relative block overflow-hidden rounded-xl border p-4 transition-all hover:-translate-y-px hover:shadow-[var(--shadow-lift)]"
            style={{ backgroundColor: tint(next.color, 8), borderColor: tint(next.color, 28) }}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: courseHex(next.color) }} />
            <div className="flex items-center justify-between gap-2 pl-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: readable(next.color) }}><Flag className="size-3.5" />{overdueCount > 0 ? "Start here" : "Next up"}</p>
              {cd && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", URGENCY_STYLE[cd.urgency])}>{cd.text}</span>}
            </div>
            <p className="mt-2 truncate pl-1.5 text-lg font-semibold leading-snug tracking-tight">{next.title}</p>
            <p className="mt-0.5 flex items-center justify-between pl-1.5 text-[13px] text-muted-foreground">
              <span className="truncate">{next.courseLabel} · {format(new Date(next.dueAt), "EEE, MMM d · h:mm a")}</span>
              <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </p>
          </Link>
        )}
      </div>
    </section>
  );
}
