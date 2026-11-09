-- Student-controlled course order (drag to reorder in My Courses; used by the sidebar everywhere).
alter table public.courses add column if not exists sort_order int not null default 0;

-- Backfill: keep the current (creation) order per student.
update public.courses c set sort_order = s.rn
from (select id, row_number() over (partition by user_id order by created_at, id) as rn from public.courses) s
where c.id = s.id;

create index if not exists courses_user_order_idx on public.courses(user_id, sort_order);
