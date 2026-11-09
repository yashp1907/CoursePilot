"use client";
import { useState } from "react";
import { CheckCircle2, Download, Plus, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstall } from "@/lib/pwa";

const DISMISS_KEY = "cp-install-dismissed";
const readDismissed = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < 14 * 86_400_000; } catch { return false; } };

function IosSteps() {
  return (
    <ol className="space-y-2 text-sm text-muted-foreground">
      <li className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">1</span>Tap the <Share className="inline size-4 text-primary" /> <b className="font-medium text-foreground">Share</b> button in Safari</li>
      <li className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">2</span>Choose <Plus className="inline size-4 text-primary" /> <b className="font-medium text-foreground">Add to Home Screen</b></li>
      <li className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">3</span>Open CoursePilot from your home screen</li>
    </ol>
  );
}

/** Settings card body: status plus the right install action for this device. */
export function InstallPanel() {
  const { canPrompt, standalone, ios, install } = useInstall();
  if (standalone) return <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" /> You&apos;re using the installed app.</p>;
  if (canPrompt) return <div className="flex flex-wrap items-center gap-3"><Button onClick={install}><Download /> Install CoursePilot</Button><p className="text-sm text-muted-foreground">Adds an icon to your home screen and opens full screen, like a native app.</p></div>;
  if (ios) return <IosSteps />;
  return <p className="text-sm text-muted-foreground">On your phone, open this site in Chrome (Android) or Safari (iPhone), then use the browser menu → <b className="font-medium text-foreground">Install app</b> / <b className="font-medium text-foreground">Add to Home Screen</b>. It needs the deployed https site, not localhost over Wi-Fi.</p>;
}

/** Small dismissible banner shown once on phones that can install. */
export function InstallBanner() {
  const { canPrompt, standalone, ios, install } = useInstall();
  const [hidden, setHidden] = useState(() => (typeof window === "undefined" ? true : readDismissed()));
  const [showIos, setShowIos] = useState(false);
  if (standalone || hidden || (!canPrompt && !ios)) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className="mb-4 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] lg:hidden anim-rise" role="region" aria-label="Install the app">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Smartphone className="size-5" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Get the app</p><p className="text-xs text-muted-foreground">Add CoursePilot to your home screen.</p></div>
        {canPrompt ? <Button size="sm" onClick={async () => { if (await install()) dismiss(); }}>Install</Button> : <Button size="sm" variant="soft" onClick={() => setShowIos((s) => !s)}>How</Button>}
        <button onClick={dismiss} aria-label="Dismiss" className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent pointer-coarse:size-11"><X className="size-4" /></button>
      </div>
      {showIos && !canPrompt && <div className="mt-3 border-t pt-3"><IosSteps /></div>}
    </div>
  );
}
