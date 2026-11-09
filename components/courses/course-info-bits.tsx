"use client";
import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, Check, ChevronDown, ClipboardCheck, Clock, Copy, ExternalLink, FileText, Mail, MapPin, MessageSquare, Search, Terminal, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { readable, tint } from "@/lib/utils/colors";
import { groupPeople, parseDays, ROLE_LABEL } from "@/lib/course-info/view";
import type { CourseInfo } from "@/lib/course-info/schemas";

type Person = CourseInfo["people"][number];
const today = () => new Date().getDay();

/** "Today" pill for anything with a day pattern ("Mon/Wed", "Thursdays 4-5pm"). Uses the browser's weekday. */
export function TodayBadge({ days }: { days: string | null | undefined }) {
  const [d] = useState(today);
  return parseDays(days).includes(d) ? <Badge variant="success" className="shrink-0">Today</Badge> : null;
}

function initials(name: string) { return name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(""); }

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} title={label} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); toast.success("Copied"); setTimeout(() => setDone(false), 1500); } catch { toast.error("Couldn't copy"); } }}
      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground cursor-pointer">
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function Row({ p, color }: { p: Person; color: string }) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/50">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: tint(color, 16), color: readable(color) }}>{initials(p.name)}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium">{p.name}</span>
          <span className="text-xs text-muted-foreground">{p.title && p.title !== ROLE_LABEL[p.role] ? p.title : p.role === "instructor" ? "" : ROLE_LABEL[p.role]}</span>
          {p.source === "page" && <Badge variant="outline">from page</Badge>}
          <TodayBadge days={p.office_hours} />
        </p>
        {(p.email || p.office_hours || p.location) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
            {p.email && <span className="flex min-w-0 items-center gap-1"><Mail className="size-3.5 shrink-0" /><a href={`mailto:${p.email}`} className="truncate hover:text-primary hover:underline">{p.email}</a><CopyButton text={p.email} label={`Copy ${p.name}'s email`} /></span>}
            {p.office_hours && <span className="flex items-center gap-1"><Clock className="size-3.5 shrink-0" />{p.office_hours}</span>}
            {p.location && !p.office_hours?.includes(p.location) && <span className="flex items-center gap-1"><MapPin className="size-3.5 shrink-0" />{p.location}</span>}
          </p>
        )}
      </div>
    </li>
  );
}

/** Compact teaching-team list: instructors first, big groups collapse after 6, a filter appears for larger teams. */
export function TeamList({ people, color }: { people: Person[]; color: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? people.filter((p) => `${p.name} ${p.email ?? ""} ${p.title ?? ""} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(s)) : people;
  }, [people, q]);
  const groups = groupPeople(filtered);
  const emails = people.filter((p) => p.email && (p.role === "instructor" || p.role === "ta" || p.role === "ia")).map((p) => p.email!).join(", ");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {people.length > 8 && (
          <div className="relative min-w-40 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input aria-label="Filter staff" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${people.length} staff…`} className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
          </div>
        )}
        {emails && <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">Copy all staff emails <CopyButton text={emails} label="Copy all staff emails" /></span>}
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No one matches “{q}”.</p>}
      {groups.map((g) => {
        const collapsible = g.people.length > 6 && !q;
        const shown = collapsible && !open[g.role] ? g.people.slice(0, 4) : g.people;
        return (
          <section key={g.role}>
            <h4 className="mb-0.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title} <span className="font-medium normal-case tracking-normal opacity-70">{g.people.length}</span></h4>
            <ul className="grid gap-x-3 md:grid-cols-2">{shown.map((p, i) => <Row key={p.name + i} p={p} color={color} />)}</ul>
            {collapsible && (
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.role]: !o[g.role] }))} className="ml-2 mt-0.5 flex items-center gap-1 text-[13px] font-medium text-primary hover:underline cursor-pointer">
                <ChevronDown className={cn("size-4 transition-transform", open[g.role] && "rotate-180")} />{open[g.role] ? "Show fewer" : `Show all ${g.people.length}`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

const LINK_ICON = { forum: MessageSquare, gradescope: ClipboardCheck, meeting: Video, calendar: CalendarDays, textbook: BookOpen, notes: FileText, autograder: Terminal, resource: ExternalLink, other: ExternalLink } as const;
export interface Chip { label: string; url: string | null; kind: string; mail?: boolean }

/** Quick links: the useful few up front, the rest behind "Show N more" so the card stays short. */
export function LinkChips({ primary, more }: { primary: Chip[]; more: Chip[] }) {
  const [open, setOpen] = useState(false);
  const list = open ? [...primary, ...more] : primary;
  const cls = "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[13px] font-medium transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary";
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c, i) => {
          const Icon = c.mail ? Mail : LINK_ICON[c.kind as keyof typeof LINK_ICON] ?? ExternalLink;
          const inner = <><Icon className="size-3.5 shrink-0" /><span className="truncate">{c.label}</span></>;
          return c.url
            ? <a key={i} href={c.url} {...(c.mail ? {} : { target: "_blank", rel: "noopener noreferrer" })} className={cls} title={c.mail ? c.url.replace("mailto:", "") : c.url}>{inner}</a>
            : <span key={i} className={cls}>{inner}</span>;
        })}
      </div>
      {more.length > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-primary hover:underline cursor-pointer">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />{open ? "Show fewer" : `Show ${more.length} more`}
        </button>
      )}
    </div>
  );
}
