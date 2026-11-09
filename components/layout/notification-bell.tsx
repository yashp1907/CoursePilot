"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Bell, CalendarClock, CheckCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead, refreshNotifications } from "@/lib/actions/notifications";

export interface NotificationItem { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

const ICON: Record<string, typeof Bell> = { overdue: AlertTriangle, exam_soon: CalendarClock, deadline_soon: CalendarClock, deadline_changed: RefreshCw, canvas_new: RefreshCw };

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  // Generate fresh reminders at most once an hour per browser session.
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem("cp_notif_at") ?? 0);
      if (Date.now() - last < 3_600_000) return;
      sessionStorage.setItem("cp_notif_at", String(Date.now()));
    } catch { /* storage unavailable: still run once */ }
    refreshNotifications().catch(() => {});   // the action refreshes the page itself when it created something
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-4 text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card shadow-xl" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <button className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer" onClick={() => start(async () => { await markAllNotificationsRead(); })}><CheckCheck className="size-3.5" /> Mark all read</button>}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.<br /><span className="text-xs">Deadline, exam and Canvas alerts show up here. Tune them in Settings.</span></li>}
            {items.map((n) => {
              const Icon = ICON[n.kind] ?? Bell;
              return (
                <li key={n.id}>
                  <button className={cn("flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-accent/60 cursor-pointer", !n.read_at && "bg-primary-soft/40")}
                    onClick={() => { setOpen(false); start(async () => { if (!n.read_at) await markNotificationRead(n.id); if (n.link) router.push(n.link); }); }}>
                    <Icon className={cn("mt-0.5 size-4 shrink-0", n.kind === "overdue" ? "text-destructive" : "text-muted-foreground")} />
                    <span className="min-w-0"><span className="block text-sm font-medium">{n.title}</span>{n.body && <span className="block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
