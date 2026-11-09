import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryNamesMatch } from "@/lib/match";
import { planSyllabusImport, type SyllabusItem } from "@/lib/syllabus-plan";
import type { SyllabusExtraction } from "@/lib/ai/schemas";
import { zonedToUtcIso } from "@/lib/utils/tz";

export type ExtractionSource = "syllabus" | "website";
export interface ApplyOpts { updateCourse: boolean; importCategories: boolean; assignmentIdx: number[]; dateIdx: number[]; timeZone: string }
export interface ApplyResult { assignments: number; events: number; categories: number; skipped: number; enriched: number; inCanvas: number; dateChanges: number }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Write reviewed extraction data into a course. Shared by syllabus and course-website imports.
 * Never deletes anything. Items already present (Canvas, earlier imports, manual) are not added again; blanks
 * are filled; and a course website may correct an older non-Canvas date that the student hasn't edited.
 */
export async function applyExtraction(supabase: SupabaseClient, userId: string, courseId: string, ex: SyllabusExtraction, o: ApplyOpts, source: ExtractionSource): Promise<ApplyResult> {
  // Date-only items default to 11:59 PM local (typical "due by end of day").
  const at = (date: string, time: string | null) => zonedToUtcIso(date, time, o.timeZone);

  if (o.updateCourse) {
    const c = ex.course; const patch: Record<string, unknown> = {};
    for (const k of ["name", "code", "professor", "professor_email", "office_hours", "classroom", "semester", "description"] as const) { const v = c[k]?.trim(); if (v) patch[k] = v; }
    if (c.credits !== null && c.credits >= 0 && c.credits <= 30) patch.credits = c.credits;
    if (Object.keys(patch).length) { const { error } = await supabase.from("courses").update(patch).eq("id", courseId); if (error) throw new Error(error.message); }
  }

  let categories = 0;
  const { data: existingCats } = await supabase.from("grading_categories").select("id, name, sort_order").eq("course_id", courseId);
  const catList: { id: string; name: string }[] = (existingCats ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
  const findCat = (name: string) => catList.find((c) => norm(c.name) === norm(name)) ?? catList.find((c) => categoryNamesMatch(c.name, name));
  if (o.importCategories && ex.grading.categories.length) {
    let order = (existingCats ?? []).reduce((m, c) => Math.max(m, c.sort_order), -1) + 1;
    for (const c of ex.grading.categories) {
      if (c.weight === null) continue;
      const existing = findCat(c.name)?.id;
      if (existing) await supabase.from("grading_categories").update({ weight: c.weight, drop_lowest: c.drop_lowest ?? 0 }).eq("id", existing);
      else {
        const { data } = await supabase.from("grading_categories").insert({ user_id: userId, course_id: courseId, name: c.name, weight: c.weight, drop_lowest: c.drop_lowest ?? 0, sort_order: order++ }).select("id").single();
        if (data) catList.push({ id: data.id as string, name: c.name });
      }
      categories++;
    }
    const patch: Record<string, unknown> = {};
    if (ex.grading.type !== "unknown") patch.grading_mode = ex.grading.type;
    if (ex.grading.scale.length) patch.grade_scale = ex.grading.scale;
    if (Object.keys(patch).length) await supabase.from("courses").update(patch).eq("id", courseId);
  }
  const matchCategory = (name: string | null) => (name ? findCat(name)?.id ?? null : null);

  // Plan against EVERYTHING already in the course (Canvas, earlier imports, manual): no overlaps.
  const { data: existingRows } = await supabase.from("assignments").select("id, title, type, due_at, points_possible, source, canvas_assignment_id, description, user_edited_fields, external_url").eq("course_id", courseId);
  const items: SyllabusItem[] = []; const pick: number[] = [];
  for (const i of o.assignmentIdx) {
    const a = ex.assignments[i]; if (!a) continue;
    items.push({ title: a.title.slice(0, 300), type: a.type, due_at: a.due_date ? at(a.due_date, a.due_time) : null, points: a.points, category: a.category, recurrence: a.recurrence, url: a.url });
    pick.push(items.length - 1);
  }
  for (const i of o.dateIdx) {
    const d = ex.important_dates[i];
    if (!d || !d.date || d.kind !== "exam") continue;
    items.push({ title: d.title.slice(0, 300), type: "exam", due_at: at(d.date, d.time), points: null, category: null, recurrence: null });
    pick.push(items.length - 1);
  }
  const plan = planSyllabusImport((existingRows ?? []) as never, items, pick, { updatableSources: source === "website" ? ["website", "syllabus"] : [] });

  let assignments = 0;
  for (const ins of plan.inserts) {
    const it = ins.item;
    const { error } = await supabase.from("assignments").insert({
      user_id: userId, course_id: courseId, category_id: matchCategory(it.category), title: it.title, description: it.recurrence ? `Recurring: ${it.recurrence}` : null,
      type: it.type, due_at: it.due_at, points_possible: it.points, source, external_url: it.url ?? null, priority: it.type === "exam" ? "high" : "medium",
    });
    if (!error) assignments++;
  }
  let enriched = 0;
  for (const e of plan.enrich) {
    const { error } = await supabase.from("assignments").update(e.patch).eq("id", e.id);
    if (!error) { enriched++; await supabase.from("assignment_history").insert(Object.entries(e.patch).map(([field, v]) => ({ user_id: userId, assignment_id: e.id, field, old_value: null, new_value: String(v), source }))); }
  }
  let dateChanges = 0;
  for (const c of plan.changes) {
    const { error } = await supabase.from("assignments").update({ due_at: c.to }).eq("id", c.id);
    if (error) continue;
    dateChanges++;
    await supabase.from("assignment_history").insert({ user_id: userId, assignment_id: c.id, field: "due_at", old_value: c.from, new_value: c.to, source });
    await supabase.from("notifications").upsert({ user_id: userId, kind: "deadline_changed", title: "Deadline changed", body: `${c.title}: the course website now says ${new Date(c.to).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: o.timeZone })} (was ${new Date(c.from).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: o.timeZone })}).`, dedupe_key: `web-due:${c.id}:${c.to}`, link: `/courses/${courseId}?tab=assignments` }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  }

  let events = 0;
  for (const i of o.dateIdx) {
    const d = ex.important_dates[i];
    if (!d || !d.date || d.kind === "exam") continue;
    const kind = d.kind === "milestone" ? "milestone" : d.kind === "holiday" || d.kind === "break" ? "holiday" : "event";
    const startsAt = at(d.date, d.time ?? "00:00");
    const { data: dupe } = await supabase.from("calendar_events").select("id").eq("course_id", courseId).eq("title", d.title.slice(0, 300)).eq("starts_at", startsAt).limit(1);
    if (dupe?.length) continue;
    const { error } = await supabase.from("calendar_events").insert({ user_id: userId, course_id: courseId, title: d.title.slice(0, 300), kind, source, starts_at: startsAt, ends_at: d.end_date ? at(d.end_date, "23:59") : null, all_day: !d.time });
    if (!error) events++;
  }

  const skipped = plan.skipped.length;
  const inCanvas = plan.skipped.filter((s) => s.reason === "in_canvas" || s.reason === "covered_by_canvas").length;
  return { assignments, events, categories, skipped, enriched, inCanvas, dateChanges };
}
