"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { createEvent, deleteEvent } from "@/lib/actions/events";
import { run } from "@/lib/utils/action";
import { localInputToIso } from "@/lib/utils/dates";
import type { CalendarEvent, Course } from "@/types/database";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; courses: Course[]; event?: CalendarEvent | null; defaultDay: Date }

export function EventDialog(props: Props) {
  const { open, onOpenChange, event } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {event ? (
        <DialogContent title={event.title} description={`${event.kind} · ${format(new Date(event.starts_at), event.all_day ? "EEE, MMM d" : "EEE, MMM d · h:mm a")}`}>
          <EventDetails onOpenChange={onOpenChange} event={event} />
        </DialogContent>
      ) : (
        <DialogContent title="New event" description="Add an exam, study block, or anything else to your calendar.">
          <EventForm {...props} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function EventDetails({ onOpenChange, event }: { onOpenChange: (o: boolean) => void; event: CalendarEvent }) {
  const [pending, start] = useTransition();
  return (
    <>
      {event.description && <p className="mb-4 whitespace-pre-wrap text-sm">{event.description}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="text-destructive" loading={pending} onClick={() => {
          if (!confirm(`Delete "${event.title}"?`)) return;
          start(async () => { const r = await run(deleteEvent(event.id), "Event deleted"); if (r.ok) onOpenChange(false); });
        }}><Trash2 /> Delete</Button>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </div>
    </>
  );
}

function EventForm({ onOpenChange, courses, defaultDay }: Props) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState(() => ({ title: "", course_id: "", kind: "event", start: format(defaultDay, "yyyy-MM-dd'T'09:00"), end: "", all_day: false, description: "" }));
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await run(createEvent({
          title: f.title, course_id: f.course_id || null, kind: f.kind as never, description: f.description,
          starts_at: localInputToIso(f.start) ?? "", ends_at: localInputToIso(f.end), all_day: f.all_day,
        }), "Event added");
        if (r.ok) onOpenChange(false); else setErrors(r.fieldErrors ?? {});
      });
    }}>
      <Field label="Title" error={errors.title}><Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Course"><NativeSelect value={f.course_id} onChange={(e) => set("course_id", e.target.value)}>
          <option value="">Personal</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code ?? c.name}</option>)}</NativeSelect></Field>
        <Field label="Kind"><NativeSelect value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="event">Event</option><option value="exam">Exam</option><option value="study">Study block</option><option value="milestone">Milestone</option><option value="holiday">Holiday / break</option></NativeSelect></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" error={errors.starts_at}><Input type="datetime-local" value={f.start} onChange={(e) => set("start", e.target.value)} required /></Field>
        <Field label="Ends (optional)" error={errors.ends_at}><Input type="datetime-local" value={f.end} onChange={(e) => set("end", e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.all_day} onChange={(e) => set("all_day", e.target.checked)} /> All day</label>
      <Field label="Notes"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" loading={pending}>Add event</Button>
      </div>
    </form>
  );
}
