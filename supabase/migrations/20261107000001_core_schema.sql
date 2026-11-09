-- CoursePilot core schema. Every user-owned table has user_id + RLS.
-- Tables for later phases (canvas, ai, notifications, planner) are created now so the schema is stable.


-- Shared trigger -------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- profiles -------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  university text,
  current_semester text,
  grade_scale_preset text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_deadlines boolean not null default true,
  notify_overdue boolean not null default true,
  notify_canvas boolean not null default true,
  notify_exams boolean not null default true,
  deadline_lead_hours int not null default 24 check (deadline_lead_hours between 1 and 336),
  weekly_study_hours numeric not null default 15 check (weekly_study_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- courses --------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  code text check (code is null or char_length(code) <= 40),
  professor text,
  professor_email text,
  office_hours text,
  classroom text,
  semester text,
  credits numeric check (credits is null or (credits >= 0 and credits <= 30)),
  description text,
  color text not null default 'blue',
  canvas_course_id text,
  grading_mode text not null default 'weighted' check (grading_mode in ('weighted','points')),
  grade_scale jsonb,                -- custom letter scale [{letter,min}] ; null = profile default
  grade_curve numeric not null default 0,
  settings jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_user_idx on public.courses(user_id, archived);
create unique index courses_canvas_uidx on public.courses(user_id, canvas_course_id) where canvas_course_id is not null;

-- syllabi --------------------------------------------------------------------
create table public.syllabi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  status text not null default 'uploaded' check (status in ('uploaded','extracting','extracted','failed','applied')),
  extracted jsonb,                  -- validated SyllabusExtraction (editable by the user)
  error text,
  model text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index syllabi_course_uidx on public.syllabi(course_id);   -- one current syllabus per course (replace = overwrite)
create index syllabi_user_idx on public.syllabi(user_id);

-- grading categories ----------------------------------------------------------
create table public.grading_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  drop_lowest int not null default 0 check (drop_lowest >= 0 and drop_lowest <= 50),
  sort_order int not null default 0,
  canvas_group_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grading_categories_course_idx on public.grading_categories(course_id);

-- assignments ----------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  category_id uuid references public.grading_categories(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  type text not null default 'homework'
    check (type in ('homework','quiz','exam','project','paper','lab','reading','presentation','study','other')),
  due_at timestamptz,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes between 0 and 10000),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','submitted')),
  points_possible numeric check (points_possible is null or points_possible >= 0),
  is_extra_credit boolean not null default false,
  source text not null default 'manual' check (source in ('manual','syllabus','canvas')),
  canvas_assignment_id text,
  user_edited_fields text[] not null default '{}',
  is_demo boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_user_due_idx on public.assignments(user_id, due_at);
create index assignments_course_idx on public.assignments(course_id);
create unique index assignments_canvas_uidx on public.assignments(user_id, course_id, canvas_assignment_id) where canvas_assignment_id is not null;

create table public.assignment_grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  points_earned numeric check (points_earned is null or points_earned >= 0),
  excused boolean not null default false,
  graded_at timestamptz,
  source text not null default 'manual' check (source in ('manual','canvas')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index assignment_grades_uidx on public.assignment_grades(assignment_id);

-- calendar events / study tasks ------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  kind text not null default 'event' check (kind in ('event','exam','holiday','milestone','study')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  source text not null default 'manual' check (source in ('manual','syllabus','canvas')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index calendar_events_user_idx on public.calendar_events(user_id, starts_at);

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  estimated_minutes int check (estimated_minutes is null or estimated_minutes >= 0),
  scheduled_for date,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_tasks_user_idx on public.study_tasks(user_id, scheduled_for);

-- activity feed ----------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  kind text not null,               -- e.g. syllabus_uploaded, assignment_completed, grade_updated
  message text not null,
  created_at timestamptz not null default now()
);
create index activity_log_user_idx on public.activity_log(user_id, created_at desc);

-- Canvas (Phase 5) -------------------------------------------------------------
create table public.canvas_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_url text not null,
  auth_type text not null check (auth_type in ('oauth','token')),
  -- Secrets are encrypted server-side before storage and never returned to the client.
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','error','revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, base_url)
);

create table public.canvas_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.canvas_connections(id) on delete cascade,
  status text not null check (status in ('running','success','partial','failed')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Notifications (Phase 7) --------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create unique index notifications_dedupe_uidx on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

-- AI assistant (Phase 6) -----------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages(conversation_id, created_at);

-- updated_at triggers ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','courses','syllabi','grading_categories','assignments',
    'assignment_grades','calendar_events','study_tasks','canvas_connections','ai_conversations']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- New-user bootstrap -----------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, nullif(new.raw_user_meta_data->>'full_name',''));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Ownership integrity: child rows must reference parents owned by the same user ----------
create or replace function public.owns_course(cid uuid) returns boolean
language sql stable security invoker as $$
  select exists (select 1 from public.courses c where c.id = cid and c.user_id = auth.uid())
$$;
create or replace function public.owns_assignment(aid uuid) returns boolean
language sql stable security invoker as $$
  select exists (select 1 from public.assignments a where a.id = aid and a.user_id = auth.uid())
$$;
create or replace function public.owns_category(cid uuid) returns boolean
language sql stable security invoker as $$
  select exists (select 1 from public.grading_categories g where g.id = cid and g.user_id = auth.uid())
$$;

-- Row Level Security ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.courses enable row level security;
alter table public.syllabi enable row level security;
alter table public.grading_categories enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_grades enable row level security;
alter table public.calendar_events enable row level security;
alter table public.study_tasks enable row level security;
alter table public.activity_log enable row level security;
alter table public.canvas_connections enable row level security;
alter table public.canvas_sync_history enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

-- profiles: id is the owner
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy user_settings_all on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy courses_all on public.courses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy syllabi_all on public.syllabi for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id));
create policy grading_categories_all on public.grading_categories for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id));
create policy assignments_all on public.assignments for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_course(course_id) and (category_id is null or public.owns_category(category_id)));
create policy assignment_grades_all on public.assignment_grades for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_assignment(assignment_id));
create policy calendar_events_all on public.calendar_events for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and (course_id is null or public.owns_course(course_id)));
create policy study_tasks_all on public.study_tasks for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and (course_id is null or public.owns_course(course_id))
    and (assignment_id is null or public.owns_assignment(assignment_id)));
create policy activity_log_all on public.activity_log for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and (course_id is null or public.owns_course(course_id)));

-- Canvas secrets: owner can see connection metadata but never the encrypted columns.
create policy canvas_connections_select on public.canvas_connections for select using (user_id = auth.uid());
create policy canvas_connections_delete on public.canvas_connections for delete using (user_id = auth.uid());
revoke select on public.canvas_connections from anon, authenticated;
grant select (id, user_id, base_url, auth_type, token_expires_at, status, last_synced_at, created_at, updated_at)
  on public.canvas_connections to authenticated;
-- inserts/updates of connections happen only through the server using the service role.
create policy canvas_sync_history_select on public.canvas_sync_history for select using (user_id = auth.uid());

create policy notifications_all on public.notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_conversations_all on public.ai_conversations for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and (course_id is null or public.owns_course(course_id)));
create policy ai_messages_all on public.ai_messages for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- Storage: private bucket, files live under <user_id>/... -----------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabi', 'syllabi', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

create policy syllabi_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = auth.uid()::text);
create policy syllabi_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'syllabi' and (storage.foldername(name))[1] = auth.uid()::text);
create policy syllabi_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = auth.uid()::text);
create policy syllabi_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'syllabi' and (storage.foldername(name))[1] = auth.uid()::text);
