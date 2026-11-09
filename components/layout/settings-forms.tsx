"use client";
import { useState, useTransition } from "react";
import { Database, Palette, RotateCcw } from "lucide-react";
import { AccentPicker, ThemePicker } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { updateProfile, updateSettings } from "@/lib/actions/settings";
import { loadDemoData, resetDemoData } from "@/lib/actions/demo";
import { SCALE_PRESETS } from "@/lib/grades/scales";
import { run } from "@/lib/utils/action";
import type { Profile, UserSettings } from "@/types/database";

export function SettingsForms({ profile, settings, hasDemo }: { profile: Profile; settings: UserSettings; hasDemo: boolean }) {
  const [p, setP] = useState({ full_name: profile.full_name ?? "", university: profile.university ?? "", current_semester: profile.current_semester ?? "", grade_scale_preset: profile.grade_scale_preset });
  const [s, setS] = useState({ notify_deadlines: settings.notify_deadlines, notify_overdue: settings.notify_overdue, notify_canvas: settings.notify_canvas, notify_exams: settings.notify_exams, deadline_lead_hours: settings.deadline_lead_hours, weekly_study_hours: Number(settings.weekly_study_hours) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pPending, startP] = useTransition();
  const [sPending, startS] = useTransition();
  const [dPending, startD] = useTransition();

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><Palette className="size-4" /> Appearance</CardTitle><CardDescription>Pick a mode and a color theme. Every theme has a light and a dark version. Saved on this browser.</CardDescription></div></CardHeader>
        <CardContent className="space-y-5">
          <div><p className="mb-2 text-[13px] font-medium text-muted-foreground">Mode</p><ThemePicker /></div>
          <div><p className="mb-2 text-[13px] font-medium text-muted-foreground">Color theme</p><AccentPicker /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Profile</CardTitle><CardDescription>Used for your greeting and default grading scale.</CardDescription></div></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); startP(async () => { const r = await run(updateProfile(p as never), "Profile saved"); if (r.ok) setErrors({}); else setErrors(r.fieldErrors ?? {}); }); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.full_name}><Input value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Field>
              <Field label="University" error={errors.university}><Input value={p.university} onChange={(e) => setP({ ...p, university: e.target.value })} placeholder="University of Michigan" /></Field>
              <Field label="Current semester" error={errors.current_semester}><Input value={p.current_semester} onChange={(e) => setP({ ...p, current_semester: e.target.value })} placeholder="Fall 2026" /></Field>
              <Field label="Default letter-grade scale" hint="Individual courses can override this."><NativeSelect value={p.grade_scale_preset} onChange={(e) => setP({ ...p, grade_scale_preset: e.target.value })}>
                {Object.entries(SCALE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</NativeSelect></Field>
            </div>
            <Button type="submit" loading={pPending}>Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Notifications &amp; planning</CardTitle><CardDescription>Choose which alerts show up in the bell menu, and how much study time you have each week.</CardDescription></div></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); startS(async () => { await run(updateSettings(s), "Preferences saved"); }); }}>
            {([["notify_deadlines", "Upcoming deadlines"], ["notify_overdue", "Overdue assignments"], ["notify_exams", "Upcoming exams"], ["notify_canvas", "New or changed Canvas assignments"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} /> {label}</label>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Remind me before a deadline (hours)"><Input type="number" min={1} max={336} value={s.deadline_lead_hours} onChange={(e) => setS({ ...s, deadline_lead_hours: Number(e.target.value) })} /></Field>
              <Field label="Study hours available per week"><Input type="number" min={0} max={100} step="0.5" value={s.weekly_study_hours} onChange={(e) => setS({ ...s, weekly_study_hours: Number(e.target.value) })} /></Field>
            </div>
            <Button type="submit" loading={sPending}>Save preferences</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle className="flex items-center gap-2"><Database className="size-4" /> Demo data</CardTitle>
          <CardDescription>Sample courses (IOE 310, IOE 333, EECS 280, IOE 373) with made-up assignments and grades. Clearly labeled &ldquo;Demo&rdquo; and never mixed up with real data.</CardDescription></div></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" loading={dPending} onClick={() => startD(async () => { await run(loadDemoData(), hasDemo ? "Demo data refreshed" : "Demo data loaded"); })}>{hasDemo ? <><RotateCcw /> Reset demo data</> : "Load demo data"}</Button>
          {hasDemo && <Button variant="ghost" className="text-destructive" disabled={dPending} onClick={() => startD(async () => { if (!confirm("Remove all demo courses and their data? Your own courses are not affected.")) return; await run(resetDemoData(), "Demo data removed"); })}>Remove demo data</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
