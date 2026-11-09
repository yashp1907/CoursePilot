import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/states";
import { SettingsForms } from "@/components/layout/settings-forms";
import { getProfile, getSettings, requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [profile, settings, { count }] = await Promise.all([
    getProfile(), getSettings(),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  if (!profile || !settings) {
    return (<><PageHeader title="Settings" /><p className="text-sm text-muted-foreground">Your profile hasn&apos;t been set up yet. Make sure the database migration has been applied, then sign out and back in.</p></>);
  }
  return (
    <>
      <PageHeader title="Settings" description={user.email} />
      <SettingsForms profile={profile} settings={settings} hasDemo={(count ?? 0) > 0} />
    </>
  );
}
