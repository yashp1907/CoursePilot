import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8" aria-label="CoursePilot home"><Logo /></Link>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <p className="mt-5 text-sm text-muted-foreground">{footer}</p>}
      <p className="mt-10 text-xs text-muted-foreground">Your entire semester, under control.</p>
    </main>
  );
}
