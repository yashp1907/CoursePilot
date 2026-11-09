-- Everything useful scraped from a course's Canvas pages (syllabus tab, home page, people, calendar, tabs, modules),
-- plus the structured understanding extracted from it. Student rosters are never requested or stored.
create table public.course_info (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  raw jsonb not null default '{}'::jsonb,          -- trimmed text/lists exactly as read from Canvas
  raw_hash text,                                    -- change detection: only re-extract when this changes
  info jsonb,                                       -- validated structured info (meetings, people, contacts, links, ...)
  status text not null default 'pending' check (status in ('pending','ready','failed','empty')),
  error text,
  model text,
  fetched_at timestamptz not null default now(),
  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id)
);
create index course_info_user_idx on public.course_info(user_id);
alter table public.course_info enable row level security;
create policy course_info_all on public.course_info for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id));
create trigger set_updated_at before update on public.course_info for each row execute function public.set_updated_at();
