import { requireUser, getProfile } from "@/lib/data/session";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/logo";
import { AppShell } from "@/components/layout/app-shell";
import { listCategories, listCourses } from "@/lib/data/queries";
import type { Assignment } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
        <Logo className="mb-6" />
        <h1 className="text-lg font-semibold">Finish setting up CoursePilot</h1>
        <p className="mt-2 text-sm text-muted-foreground">Supabase isn&apos;t configured yet. Copy <code className="rounded bg-muted px-1">.env.example</code> to <code className="rounded bg-muted px-1">.env.local</code>, add your Supabase URL and anon key, apply the migrations in <code className="rounded bg-muted px-1">supabase/migrations</code>, then restart the dev server. See README.md for the full steps.</p>
      </main>
    );
  }
  const user = await requireUser();
  const supabase = await createClient();
  const [profile, courses, categories, assignRes, notifRes, connRes] = await Promise.all([
    getProfile(), listCourses(), listCategories(),
    supabase.from("assignments").select("*").neq("status", "completed").neq("status", "submitted").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(20),
    // canvas_connections may not exist until migration 2 is applied: treat any error as "not connected".
    supabase.from("canvas_connections").select("status, last_synced_at, auth_type").limit(1).maybeSingle(),
  ]);
  const conn = connRes.error ? null : (connRes.data as { status: string; last_synced_at: string | null; auth_type: string } | null);
  return (
    <AppShell
      name={profile?.full_name ?? ""} email={user.email ?? ""} courses={courses} categories={categories} semester={profile?.current_semester ?? null}
      openAssignments={(assignRes.data ?? []) as Assignment[]} notifications={notifRes.error ? [] : (notifRes.data ?? [])}
      canvas={{ connected: !!conn, status: conn?.status ?? null, lastSyncedAt: conn?.last_synced_at ?? null, authType: conn?.auth_type ?? null }}
    >
      {children}
    </AppShell>
  );
}
