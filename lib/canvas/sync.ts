import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment, Course, GradingCategoryRow } from "@/types/database";
import { CanvasAuthError } from "./client";
import type { CanvasSource } from "./source";
import { mapAssignment, mapCourse, normName, safeHttpsUrl } from "./map";
import { rawHash } from "@/lib/course-info/schemas";
import { decideGrade, planAssignmentSync, planCategorySync, type PlannedNotification } from "./plan";

export interface SyncSummary {
  courses: number;
  coursesCreated: number;
  assignmentsNew: number;
  assignmentsUpdated: number;
  assignmentsLinked: number;
  deadlineChanges: number;
  gradesUpdated: number;
  announcements: number;
  infoQueued: number;
  conflicts: string[];
  notes: string[];
  errors: string[];
}

const emptySummary = (): SyncSummary => ({ courses: 0, coursesCreated: 0, assignmentsNew: 0, assignmentsUpdated: 0, assignmentsLinked: 0, deadlineChanges: 0, gradesUpdated: 0, announcements: 0, infoQueued: 0, conflicts: [], notes: [], errors: [] });

/** Pull courses, assignments, grades and announcements from Canvas into Supabase, reconciling instead of overwriting. */
export async function runCanvasSync(opts: {
  supabase: SupabaseClient; userId: string; connectionId: string; client: CanvasSource; timeZone: string; onlyCourseId?: string; now?: Date;
}): Promise<SyncSummary> {
  const { supabase, userId, connectionId, client, timeZone } = opts;
  const now = opts.now ?? new Date();
  const summary = emptySummary();

  const { data: hist } = await supabase.from("canvas_sync_history").insert({ user_id: userId, connection_id: connectionId, status: "running" }).select("id").single();
  const finish = async (status: "success" | "partial" | "failed", error?: string) => {
    if (hist) await supabase.from("canvas_sync_history").update({ status, summary, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", hist.id);
    if (status !== "failed") await supabase.from("canvas_connections").update({ last_synced_at: new Date().toISOString(), status: "active" }).eq("id", connectionId);
  };

  const notifications: PlannedNotification[] = [];
  try {
    const canvasCourses = (await client.courses()).filter((c) => c.name || c.course_code).filter((c) => !c.access_restricted_by_date);
    const { data: localCourses } = await supabase.from("courses").select("*");
    const locals = (localCourses ?? []) as Course[];
    let nextOrder = locals.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 1;
    const hasOrder = locals.length > 0 && locals.some((c) => c.sort_order !== undefined);

    for (const cc of canvasCourses) {
      const m = mapCourse(cc);
      if (opts.onlyCourseId && locals.find((l) => l.canvas_course_id === m.canvas_course_id)?.id !== opts.onlyCourseId) continue;
      try {
        // 1. Match or create the course.
        let course = locals.find((l) => l.canvas_course_id === m.canvas_course_id);
        if (!course) {
          const byCode = m.code ? locals.find((l) => !l.canvas_course_id && !l.is_demo && normName(l.code ?? l.name) === normName(m.code)) : undefined;
          if (byCode) {
            await supabase.from("courses").update({ canvas_course_id: m.canvas_course_id }).eq("id", byCode.id);
            course = { ...byCode, canvas_course_id: m.canvas_course_id };
            summary.notes.push(`Linked Canvas course "${m.name}" to your existing ${byCode.code ?? byCode.name}.`);
          } else {
            const { data, error } = await supabase.from("courses").insert({
              user_id: userId, name: m.name, code: m.code, semester: m.semester, canvas_course_id: m.canvas_course_id,
              grading_mode: m.weighted ? "weighted" : "points", ...(hasOrder ? { sort_order: nextOrder++ } : {}),
            }).select("*").single();
            if (error || !data) throw new Error(error?.message ?? "Couldn't create course");
            course = data as Course; summary.coursesCreated++;
          }
          locals.push(course);
        }
        summary.courses++;
        const label = course.code ?? course.name;

        // 2. Assignment groups -> grading categories (additive; never overwrites your weights).
        const groups = await client.assignmentGroups(m.canvas_course_id).catch(() => []);
        const { data: catRows } = await supabase.from("grading_categories").select("*").eq("course_id", course.id);
        const cats = (catRows ?? []) as GradingCategoryRow[];
        const cplan = planCategorySync(cats, groups, m.weighted);
        for (const l of cplan.link) await supabase.from("grading_categories").update({ canvas_group_id: l.canvas_group_id }).eq("id", l.id);
        if (cplan.create.length) {
          const base = cats.reduce((mx, c) => Math.max(mx, c.sort_order), -1) + 1;
          await supabase.from("grading_categories").insert(cplan.create.map((c, i) => ({ user_id: userId, course_id: course!.id, name: c.name, weight: c.weight, drop_lowest: c.drop_lowest, sort_order: base + i, canvas_group_id: c.canvas_group_id })));
        }
        for (const d of cplan.differences) summary.notes.push(`${label}: Canvas lists ${d.name} as ${d.canvas.weight}% (drop ${d.canvas.drop}); you have ${d.mine.weight}% (drop ${d.mine.drop}). Kept yours.`);
        const { data: allCats } = await supabase.from("grading_categories").select("id, canvas_group_id").eq("course_id", course.id);
        const catByGroup = new Map((allCats ?? []).filter((c) => c.canvas_group_id).map((c) => [c.canvas_group_id as string, c.id as string]));

        // 3. Assignments.
        const incoming = (await client.assignments(m.canvas_course_id)).map(mapAssignment).filter((x): x is NonNullable<typeof x> => !!x);
        const { data: existingRows } = await supabase.from("assignments").select("*").eq("course_id", course.id);
        const existing = (existingRows ?? []) as Assignment[];
        const plan = planAssignmentSync({ existing, incoming, courseId: course.id, courseLabel: label, timeZone });

        const idByCanvas = new Map(existing.filter((a) => a.canvas_assignment_id).map((a) => [a.canvas_assignment_id as string, a.id]));
        if (plan.inserts.length) {
          const rows = plan.inserts.map((i) => ({
            user_id: userId, course_id: course!.id, category_id: i.canvas_group_id ? catByGroup.get(i.canvas_group_id) ?? null : null,
            title: i.title, description: i.description, type: i.type, due_at: i.due_at, points_possible: i.points_possible,
            is_extra_credit: false, source: "canvas", canvas_assignment_id: i.canvas_assignment_id, external_url: i.external_url,
            status: i.canvas_status ?? "not_started", priority: i.type === "exam" ? "high" : "medium", completed_at: i.canvas_status ? now.toISOString() : null, estimated_minutes: null,
          }));
          // Upsert on the unique (user, course, canvas id) index so a retried sync can never create duplicates.
          const { data: ins, error } = await supabase.from("assignments").upsert(rows, { onConflict: "user_id,course_id,canvas_assignment_id", ignoreDuplicates: true }).select("id, canvas_assignment_id");
          if (error) throw new Error(error.message);
          for (const r of ins ?? []) idByCanvas.set(r.canvas_assignment_id as string, r.id as string);
          summary.assignmentsNew += ins?.length ?? 0;
        }
        // Adopt matching syllabus/manual assignments (no duplicates).
        const linkHistory: Record<string, unknown>[] = [];
        for (const l of plan.links) {
          const patch = { ...l.patch } as Record<string, unknown>;
          const mine = existing.find((a) => a.id === l.id);
          if (mine && !mine.category_id && l.incoming.canvas_group_id && catByGroup.get(l.incoming.canvas_group_id)) patch.category_id = catByGroup.get(l.incoming.canvas_group_id);
          const { error } = await supabase.from("assignments").update(patch).eq("id", l.id);
          if (error) { summary.errors.push(`${label} · ${l.title}: couldn't link to Canvas (${error.message})`); continue; }
          idByCanvas.set(l.canvasId, l.id); summary.assignmentsLinked++;
          for (const h of l.history) linkHistory.push({ user_id: userId, assignment_id: l.id, field: h.field, old_value: h.old_value, new_value: h.new_value, source: "canvas" });
          for (const c of l.conflicts) summary.conflicts.push(`${label} · ${l.title}: kept your ${c.field} (Canvas has a different one)`);
        }
        if (plan.links.length) summary.notes.push(`${label}: matched ${plan.links.length} existing ${plan.links.length === 1 ? "assignment" : "assignments"} to Canvas instead of adding duplicates (${plan.links.map((l) => `"${l.title}"`).slice(0, 3).join(", ")}${plan.links.length > 3 ? "…" : ""}).`);
        if (linkHistory.length) await supabase.from("assignment_history").insert(linkHistory);
        for (const u of plan.updates) {
          const { error } = await supabase.from("assignments").update(u.patch).eq("id", u.id);
          if (!error) summary.assignmentsUpdated++;
        }
        if (plan.history.length) await supabase.from("assignment_history").insert(plan.history.map((h) => ({ user_id: userId, assignment_id: h.assignmentId, field: h.field, old_value: h.old_value, new_value: h.new_value, source: "canvas" })));
        summary.deadlineChanges += plan.notifications.filter((n) => n.kind === "deadline_changed").length;
        for (const c of plan.conflicts) summary.conflicts.push(`${label} · ${c.title}: kept your ${c.conflicts.map((x) => x.field).join(", ")}`);
        if (plan.missingFromCanvas) summary.notes.push(`${label}: ${plan.missingFromCanvas} assignment(s) no longer appear in Canvas (kept in CoursePilot).`);
        notifications.push(...plan.notifications);

        // 4. Grades.
        const ids = [...idByCanvas.values()];
        const { data: gradeRows } = ids.length ? await supabase.from("assignment_grades").select("assignment_id, points_earned, excused, source").in("assignment_id", ids) : { data: [] };
        const gradeBy = new Map((gradeRows ?? []).map((g) => [g.assignment_id as string, g as { points_earned: number | null; excused: boolean; source: string }]));
        const toWrite: Record<string, unknown>[] = [];
        for (const inc of incoming) {
          if (!inc.grade) continue;
          const aid = idByCanvas.get(inc.canvas_assignment_id);
          if (!aid) continue;
          const d = decideGrade(gradeBy.get(aid), inc.grade);
          if (d === "conflict") summary.conflicts.push(`${label} · ${inc.title}: Canvas grade differs from the one you entered, kept yours`);
          if (d === "write") toWrite.push({ user_id: userId, assignment_id: aid, points_earned: inc.grade.points, excused: inc.grade.excused, graded_at: inc.grade.graded_at ?? now.toISOString(), source: "canvas" });
        }
        if (toWrite.length) {
          const { error } = await supabase.from("assignment_grades").upsert(toWrite, { onConflict: "assignment_id" });
          if (!error) summary.gradesUpdated += toWrite.length;
        }

        // 5. Announcements (best effort; some institutions disable this).
        try {
          const since = new Date(+now - 60 * 86_400_000).toISOString();
          const ann = await client.announcements(m.canvas_course_id, since);
          if (ann.length) {
            const { data: saved } = await supabase.from("course_announcements").upsert(
              ann.map((a) => ({ user_id: userId, course_id: course!.id, canvas_id: String(a.id), title: (a.title ?? "Announcement").slice(0, 300), message: a.message ? a.message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000) : null, posted_at: a.posted_at ?? null, url: safeHttpsUrl(a.html_url) })),
              { onConflict: "user_id,course_id,canvas_id", ignoreDuplicates: true },
            ).select("id");
            summary.announcements += saved?.length ?? 0;
          }
        } catch { /* announcements are optional */ }

        // 6. Everything else about the course (syllabus tab, pages, staff, calendar, tabs, modules). Stored raw; the
        //    AI reading happens afterwards, only for courses whose content changed.
        if (client.courseInfo) {
          try {
            const rawInfo = await client.courseInfo(m.canvas_course_id);
            if (rawInfo) {
              const hash = await rawHash(rawInfo);
              const { data: cur, error: ce } = await supabase.from("course_info").select("id, raw_hash, status").eq("course_id", course.id).maybeSingle();
              if (ce) { if (!summary.notes.some((n) => n.includes("0006"))) summary.notes.push("Course info wasn't saved: apply the latest database migration (…0006_course_info.sql)."); }
              else if (!cur) { const { error } = await supabase.from("course_info").insert({ user_id: userId, course_id: course.id, raw: rawInfo, raw_hash: hash, status: "pending" }); if (!error) summary.infoQueued++; }
              else if (cur.raw_hash !== hash || cur.status === "failed") { const { error } = await supabase.from("course_info").update({ raw: rawInfo, raw_hash: hash, status: "pending", fetched_at: new Date().toISOString() }).eq("id", cur.id); if (!error) summary.infoQueued++; }
            }
          } catch { /* course info is best-effort */ }
        }
      } catch (e) {
        if (e instanceof CanvasAuthError) throw e;
        summary.errors.push(`${m.code ?? m.name}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    if (notifications.length) {
      await supabase.from("notifications").upsert(notifications.map((n) => ({ user_id: userId, ...n })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    }
    const bits = [
      summary.assignmentsNew && `${summary.assignmentsNew} new assignment${summary.assignmentsNew === 1 ? "" : "s"}`,
      summary.assignmentsUpdated && `${summary.assignmentsUpdated} updated`, summary.gradesUpdated && `${summary.gradesUpdated} grade${summary.gradesUpdated === 1 ? "" : "s"}`,
    ].filter(Boolean);
    await supabase.from("activity_log").insert({ user_id: userId, kind: "canvas_sync", message: `Canvas sync: ${bits.length ? bits.join(", ") : "everything up to date"}` });
    await finish(summary.errors.length ? "partial" : "success");
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    if (e instanceof CanvasAuthError) await supabase.from("canvas_connections").update({ status: "expired" }).eq("id", connectionId);
    summary.errors.push(msg);
    await finish("failed", msg);
    throw e;
  }
}
