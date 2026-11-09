"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

const THRESHOLD = 72;

/** Pull down at the top of the page to refresh, like a native app. Touch devices only; ignored while a dialog is open. */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && !document.querySelector("[role=dialog]") ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { pullRef.current = 0; setPull(0); return; }
      pullRef.current = Math.min(dy * 0.5, 96); setPull(pullRef.current);
    };
    const onEnd = () => {
      const fired = pullRef.current >= THRESHOLD; start.current = null; pullRef.current = 0; setPull(0);
      if (fired) { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 900); }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => { window.removeEventListener("touchstart", onStart); window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd); window.removeEventListener("touchcancel", onEnd); };
  }, [router]);

  const y = busy ? 52 : pull;
  if (y <= 0) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center" style={{ transform: `translateY(calc(env(safe-area-inset-top) + ${Math.min(y, 60) - 40}px))`, opacity: Math.min(1, y / THRESHOLD) }}>
      <span className="flex size-9 items-center justify-center rounded-full border bg-card text-primary shadow-[var(--shadow-lift)]">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4 transition-transform" style={{ transform: `rotate(${y * 4}deg)` }} />}
      </span>
    </div>
  );
}
