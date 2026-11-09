-- Phase 5-7 additions: assignment change history, course announcements, Canvas connection writes.

-- Assignment history: every Canvas-detected or user-made change to a tracked field.
create table public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  source text not null default 'canvas' check (source in ('canvas','manual','syllabus')),
  created_at timestamptz not null default now()
);
create index assignment_history_idx on public.assignment_history(assignment_id, created_at desc);
alter table public.assignment_history enable row level security;
create policy assignment_history_all on public.assignment_history for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_assignment(assignment_id));

alter table public.assignments add column external_url text;

-- Course announcements imported from Canvas.
create table public.course_announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  canvas_id text not null,
  title text not null,
  message text,
  posted_at timestamptz,
  url text,
  created_at timestamptz not null default now(),
  unique (user_id, course_id, canvas_id)
);
create index course_announcements_idx on public.course_announcements(user_id, posted_at desc);
alter table public.course_announcements enable row level security;
create policy course_announcements_all on public.course_announcements for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id));

-- Canvas connections: owners may create/update their connection (secrets arrive already encrypted
-- with a server-only key). Encrypted columns stay unreadable via normal selects; the server reads
-- them through this owner-checked function.
create policy canvas_connections_insert on public.canvas_connections for insert with check (user_id = auth.uid());
create policy canvas_connections_update on public.canvas_connections for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.canvas_secrets(p_connection uuid)
returns table (base_url text, auth_type text, access_token_enc text, refresh_token_enc text, token_expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.base_url, c.auth_type, c.access_token_enc, c.refresh_token_enc, c.token_expires_at
  from public.canvas_connections c where c.id = p_connection and c.user_id = auth.uid()
$$;
revoke all on function public.canvas_secrets(uuid) from public, anon;
grant execute on function public.canvas_secrets(uuid) to authenticated;

-- Syncs write history/grades from the owner's session; make sure sync history can be inserted by the owner too.
create policy canvas_sync_history_insert on public.canvas_sync_history for insert with check (user_id = auth.uid());
create policy canvas_sync_history_update on public.canvas_sync_history for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Upserts (ON CONFLICT) need plain unique indexes, not partial ones. NULLs are already distinct in Postgres,
-- so uniqueness of non-null Canvas ids / dedupe keys is unchanged.
drop index if exists public.assignments_canvas_uidx;
create unique index assignments_canvas_uidx on public.assignments(user_id, course_id, canvas_assignment_id);
drop index if exists public.notifications_dedupe_uidx;
create unique index notifications_dedupe_uidx on public.notifications(user_id, dedupe_key);

-- Study planner availability: hours available Mon..Sun (array of 7 numbers). NULL = weekly_study_hours spread evenly.
alter table public.user_settings add column availability jsonb;
alter table public.user_settings add constraint availability_shape check (
  availability is null or (jsonb_typeof(availability) = 'array' and jsonb_array_length(availability) = 7)
);
