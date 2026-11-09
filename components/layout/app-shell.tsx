"use client";
import Link from "next/link";
import { NavLink } from "@/components/ui/nav-link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, ChevronDown, LogOut, Menu, MoreHorizontal, Plus, Search, WifiOff, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/lib/theme";
import { CourseDot } from "@/components/ui/course-dot";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/actions/auth";
import { summarizeSync, syncCanvas } from "@/lib/canvas/client-sync";
import { pingExtension } from "@/lib/canvas/extension-bridge";
import { AssignmentDialog } from "@/components/assignments/assignment-dialog";
import { CourseFormDialog } from "@/components/courses/course-form-dialog";
import { EventDialog } from "@/components/calendar/event-dialog";
import { InstallBanner } from "@/components/ui/install-app";
import { CommandPalette } from "./command-palette";
import { PullToRefresh } from "./pull-to-refresh";
import { NotificationBell, type NotificationItem } from "./notification-bell";
import { MOBILE_TABS, NAV } from "./nav";
import type { Assignment, Course, GradingCategoryRow } from "@/types/database";

export interface ShellProps {
  name: string; email: string; courses: Course[]; categories: GradingCategoryRow[]; openAssignments: Assignment[];
  notifications: NotificationItem[]; semester: string | null;
  canvas: { connected: boolean; status: string | null; lastSyncedAt: string | null; authType: string | null };
  children: React.ReactNode;
}

const STALE_MS = 3 * 3_600_000;

function NavList({ courses, onNavigate, badges }: { courses: Course[]; onNavigate?: () => void; badges: Record<string, { n: number; tone: "danger" | "info" }> }) {
  const pathname = usePathname();
  const [coursesOpen, setCoursesOpen] = useState(true);
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const isCourses = item.href === "/courses";
              return (
                <li key={item.href}>
                  <div className="flex items-center">
                    <NavLink href={item.href} onClick={onNavigate} aria-current={pathname === item.href ? "page" : undefined} title={item.hint}
                      className={cn("relative flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 pointer-coarse:py-2.5 text-sm font-medium transition-colors", active && (!isCourses || pathname === "/courses") ? "bg-primary-soft text-primary before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                      <item.icon className="size-[17px]" /><span className="flex-1">{item.label}</span>
                      {badges[item.href] && <span className={cn("min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums", badges[item.href].tone === "danger" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")} aria-label={`${badges[item.href].n} ${badges[item.href].tone === "danger" ? "overdue" : "due soon"}`}>{badges[item.href].n}</span>}
                    </NavLink>
                    {isCourses && courses.length > 0 && (
                      <button onClick={() => setCoursesOpen((o) => !o)} aria-label={coursesOpen ? "Collapse courses" : "Expand courses"} aria-expanded={coursesOpen} className="ml-1 rounded p-1 text-muted-foreground hover:bg-accent cursor-pointer">
                        <ChevronDown className={cn("size-3.5 transition-transform", !coursesOpen && "-rotate-90")} />
                      </button>
                    )}
                  </div>
                  {isCourses && coursesOpen && courses.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 border-l pl-2 ml-4">
                      {courses.map((c) => {
                        const on = pathname === `/courses/${c.id}`;
                        return (
                          <li key={c.id}>
                            <NavLink href={`/courses/${c.id}`} onClick={onNavigate} aria-current={on ? "page" : undefined}
                              className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors", on ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                              <CourseDot color={c.color} /><span className="truncate">{c.code ?? c.name}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ name, email }: { name: string; email: string }) {
  return (
    <div className="border-t p-3">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary ring-1 ring-primary/20">{(name || email).slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name || "Student"}</p><p className="truncate text-xs text-muted-foreground">{email}</p></div>
        <form action={logout}><button type="submit" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer" aria-label="Log out" title="Log out"><LogOut className="size-4" /></button></form>
      </div>
    </div>
  );
}

export function AppShell({ name, email, courses, categories, openAssignments, notifications, semester, canvas, children }: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setMenu(false); }
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [assignDlg, setAssignDlg] = useState<{ open: boolean; assignment: Assignment | null }>({ open: false, assignment: null });
  const [courseDlg, setCourseDlg] = useState(false);
  const [eventDlg, setEventDlg] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep Canvas fresh: sync in the background when it hasn't run for a few hours (once per browser session window).
  useEffect(() => {
    if (!canvas.connected || canvas.status !== "active") return;
    const last = canvas.lastSyncedAt ? new Date(canvas.lastSyncedAt).getTime() : 0;
    if (Date.now() - last < STALE_MS) return;
    try {
      if (Date.now() - Number(sessionStorage.getItem("cp_canvas_auto") ?? 0) < STALE_MS) return;
      sessionStorage.setItem("cp_canvas_auto", String(Date.now()));
    } catch { /* ignore */ }
    const method = canvas.authType === "extension" ? "extension" : "api";
    (async () => {
      // The extension route only works if the extension is present in this browser; otherwise stay quiet.
      if (method === "extension" && !(await pingExtension())) return;
      const r = await syncCanvas(method);
      if (r.ok) { const text = summarizeSync(r.summary); if (!text.startsWith("Everything")) toast.success(`Canvas synced: ${text}`); router.refresh(); }
      else if (r.code === "auth" || r.code === "config" || r.code === "not_logged_in") toast.error(`Canvas: ${r.error}`, { action: { label: "Open Integrations", onClick: () => router.push("/integrations") } });
    })();
  }, [canvas.connected, canvas.status, canvas.lastSyncedAt, canvas.authType, router]);

  const syncNow = async () => {
    const id = toast.loading("Syncing with Canvas…");
    const r = await syncCanvas(canvas.authType === "extension" ? "extension" : "api");
    toast.dismiss(id);
    if (r.ok) { toast.success(`Canvas synced: ${summarizeSync(r.summary)}`); router.refresh(); } else toast.error(r.error);
  };

  const [nowMs] = useState(() => Date.now());
  const badges = useMemo((): Record<string, { n: number; tone: "danger" | "info" }> => {
    const now = nowMs; const overdue = openAssignments.filter((a) => a.due_at && +new Date(a.due_at) < now).length;
    const soon = openAssignments.filter((a) => a.due_at && +new Date(a.due_at) >= now && +new Date(a.due_at) < now + 7 * 86_400_000).length;
    return overdue ? { "/assignments": { n: overdue, tone: "danger" as const } } : soon ? { "/assignments": { n: soon, tone: "info" as const } } : {};
  }, [openAssignments, nowMs]);
  const { resolved: theme, setPref: setTheme } = useTheme();
  const actions = useMemo(() => [
    { id: "new-assignment", label: "New assignment", run: () => setAssignDlg({ open: true, assignment: null }) },
    { id: "new-course", label: "New course", run: () => setCourseDlg(true) },
    { id: "new-event", label: "New calendar event", run: () => setEventDlg(true) },
    { id: "theme", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode", run: () => setTheme(theme === "dark" ? "light" : "dark") },
    ...(canvas.connected ? [{ id: "sync", label: "Sync Canvas now", run: syncNow }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canvas.connected, theme]);

  const SearchButton = (
    <button onClick={() => setPaletteOpen(true)} className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer" aria-label="Search and jump (Command K)">
      <Search className="size-4" /><span className="flex-1 text-left">Search or jump to…</span><kbd className="hidden rounded border bg-muted px-1.5 text-[11px] font-medium sm:block">⌘K</kbd>
    </button>
  );
  const QuickAdd = (
    <div className="relative">
      <Button size="sm" onClick={() => setAddOpen((o) => !o)} aria-haspopup="menu" aria-expanded={addOpen}><Plus /> <span className="hidden sm:inline">Add</span></Button>
      {addOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAddOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border bg-card p-1 shadow-[var(--shadow-pop)] anim-fade">
            {[{ l: "Assignment", f: () => setAssignDlg({ open: true, assignment: null }) }, { l: "Course", f: () => setCourseDlg(true) }, { l: "Calendar event", f: () => setEventDlg(true) }].map((i) => (
              <button key={i.l} role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent cursor-pointer" onClick={() => { setAddOpen(false); i.f(); }}><CalendarPlus className="size-4 text-muted-foreground" />{i.l}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow">Skip to content</a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-5"><Link href="/dashboard" aria-label="CoursePilot home"><Logo /></Link></div>
        <NavList courses={courses} badges={badges} />
        <UserFooter name={name} email={email} />
      </aside>

      <div className="lg:pl-60">
        <header className="scroll-header sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-sidebar/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6">
          <button onClick={() => setMenu(true)} className="rounded-md p-2 pointer-coarse:p-2.5 hover:bg-accent cursor-pointer lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <Link href="/dashboard" className="lg:hidden" aria-label="CoursePilot home"><Logo /></Link>
          <div className="hidden flex-1 lg:block">{SearchButton}</div>
          {semester && <span className="hidden text-xs text-muted-foreground xl:block">{semester}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setPaletteOpen(true)} className="rounded-md p-2 pointer-coarse:p-2.5 text-muted-foreground hover:bg-accent cursor-pointer lg:hidden" aria-label="Search"><Search className="size-[18px]" /></button>
            {QuickAdd}
            <ThemeToggle />
            <NotificationBell items={notifications} />
          </div>
        </header>

        {offline && <div role="status" className="flex items-center justify-center gap-2 bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"><WifiOff className="size-3.5" /> You&apos;re offline. Changes can&apos;t be saved until you reconnect.</div>}
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-9 lg:pb-9">
          <InstallBanner />
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-sidebar/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Primary">
        {MOBILE_TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <NavLink key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("group relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:scale-95", active ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}><t.icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} /></span>
              {t.label.replace("My ", "").replace("Overview", "Home")}
            </NavLink>
          );
        })}
        <button onClick={() => setMenu(true)} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors active:scale-95 cursor-pointer")} aria-label="More: all sections">
          <span className="flex h-7 w-12 items-center justify-center rounded-full"><MoreHorizontal className="size-[22px]" strokeWidth={1.75} /></span>More
        </button>
      </nav>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm anim-fade" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-sidebar pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-5"><Logo /><button onClick={() => setMenu(false)} className="rounded-md p-1.5 hover:bg-accent cursor-pointer" aria-label="Close menu"><X className="size-4" /></button></div>
            <NavList courses={courses} onNavigate={() => setMenu(false)} badges={badges} />
            <UserFooter name={name} email={email} />
          </div>
        </div>
      )}

      <PullToRefresh />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} courses={courses} assignments={openAssignments} actions={actions} onOpenAssignment={(a) => setAssignDlg({ open: true, assignment: a })} />
      <AssignmentDialog open={assignDlg.open} onOpenChange={(o) => setAssignDlg((d) => ({ ...d, open: o }))} courses={courses} categories={categories} assignment={assignDlg.assignment} />
      <CourseFormDialog open={courseDlg} onOpenChange={setCourseDlg} defaultSemester={semester} />
      <EventDialog open={eventDlg} onOpenChange={setEventDlg} courses={courses} defaultDay={new Date()} />
    </div>
  );
}
