-- Canvas data can also arrive through the CoursePilot browser extension (for schools that block access tokens).
-- Those connections hold no secret: the extension reads Canvas using the student's own logged-in browser session.
alter table public.canvas_connections drop constraint if exists canvas_connections_auth_type_check;
alter table public.canvas_connections add constraint canvas_connections_auth_type_check check (auth_type in ('oauth','token','extension'));
