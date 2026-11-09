import Link from "next/link";
import { BarChart3, CalendarCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const POINTS = [
  { icon: CalendarCheck, title: "Every deadline in one place", text: "Canvas, course websites and syllabi, merged without duplicates." },
  { icon: BarChart3, title: "Grades you can trust", text: "Exact grade math and what-if planning, never guessed by AI." },
  { icon: Sparkles, title: "An assistant that knows your semester", text: "Ask about workload, priorities and what you need on the final." },
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/5 bg-[#0e1014] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(46rem_30rem_at_0%_0%,color-mix(in_srgb,var(--brand-bright)_24%,transparent),transparent_70%),radial-gradient(34rem_26rem_at_100%_100%,color-mix(in_srgb,var(--brand-bright)_12%,transparent),transparent_70%)]" />
        <Link href="/" aria-label="CoursePilot home" className="relative w-fit text-white"><Logo /></Link>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">Your entire semester, <span className="text-[var(--brand-bright)]">under control.</span></h2>
          <ul className="mt-9 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15"><p.icon className="size-[18px] text-[var(--brand-bright)]" /></span>
                <div><p className="text-[15px] font-medium">{p.title}</p><p className="mt-0.5 text-sm leading-relaxed text-white/60">{p.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Built for college students. Your data stays yours.</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-4 py-10">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <Link href="/" className="mb-8 lg:hidden" aria-label="CoursePilot home"><Logo /></Link>
        <div className="w-full max-w-sm anim-rise">
          <div className="rounded-2xl border bg-card p-7 shadow-[var(--shadow-lift)]">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
