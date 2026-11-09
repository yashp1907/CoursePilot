import type { Metadata } from "next";
import { RotateCw, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark className="size-12" />
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary"><WifiOff className="size-6" /></div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">CoursePilot needs a connection to load your courses and deadlines. Check your signal and try again.</p>
      </div>
      {/* A plain link (not a client component) so the page works even if scripts can't load. */}
      <a href="/dashboard" className={cn(buttonVariants(), "pointer-coarse:h-12")}><RotateCw /> Try again</a>
    </main>
  );
}
