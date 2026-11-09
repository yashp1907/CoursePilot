-- Course websites (e.g. EECS 280's site): a public page a course keeps its schedule/assignments on.
create table public.course_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  status text not null default 'idle' check (status in ('idle','fetching','ready','failed')),
  error text,
  pages jsonb not null default '[]'::jsonb,        -- [{url,title,chars}] what was read last time
  extracted jsonb,                                  -- validated extraction (same shape as syllabus extraction)
  content_hash text,                                -- skip the AI call when the site hasn't changed
  last_fetched_at timestamptz,
  last_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id)
);
create index course_websites_user_idx on public.course_websites(user_id);
alter table public.course_websites enable row level security;
create policy course_websites_all on public.course_websites for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id));
create trigger set_updated_at before update on public.course_websites for each row execute function public.set_updated_at();

-- Items imported from a course website are labeled as such.
alter table public.assignments drop constraint if exists assignments_source_check;
alter table public.assignments add constraint assignments_source_check check (source in ('manual','syllabus','canvas','website'));
alter table public.calendar_events drop constraint if exists calendar_events_source_check;
alter table public.calendar_events add constraint calendar_events_source_check check (source in ('manual','syllabus','canvas','website'));
