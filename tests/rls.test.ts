/**
 * Runs the REAL migration in an in-process Postgres (PGlite) with minimal stand-ins for Supabase's
 * auth/storage schemas, then checks that Row Level Security isolates users.
 * Note: this validates our SQL and policies, not Supabase's own auth service.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
const as = async (uid: string | null) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  await db.exec(uid ? "set role authenticated" : "set role anon");
};
const asAdmin = async () => { await db.exec("reset role"); };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    -- Supabase grants new public tables to these roles by default, before our migration runs:
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const f of ["20261107000001_core_schema.sql", "20261107000002_canvas_history_announcements.sql", "20261107000003_canvas_extension.sql", "20261107000004_course_order.sql", "20261107000005_course_websites.sql"]) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`
    insert into auth.users (id, raw_user_meta_data) values ('${A}', '{"full_name":"Alice"}'), ('${B}', '{"full_name":"Bob"}');
  `);
});

describe("migration + signup trigger", () => {
  it("creates a profile and settings row for each new user", async () => {
    await asAdmin();
    const p = await db.query<{ full_name: string }>("select full_name from profiles order by full_name");
    expect(p.rows.map((r) => r.full_name)).toEqual(["Alice", "Bob"]);
    expect((await db.query("select 1 from user_settings")).rows).toHaveLength(2);
  });
});

describe("row level security", () => {
  let courseA = "", assignA = "";
  beforeAll(async () => {
    await as(A);
    courseA = (await db.query<{ id: string }>(`insert into courses (user_id, name, code) values ('${A}', 'IOE 310', 'IOE 310') returning id`)).rows[0].id;
    assignA = (await db.query<{ id: string }>(`insert into assignments (user_id, course_id, title, points_possible) values ('${A}', '${courseA}', 'HW1', 100) returning id`)).rows[0].id;
    await db.query(`insert into assignment_grades (user_id, assignment_id, points_earned) values ('${A}', '${assignA}', 90)`);
    await db.query(`insert into grading_categories (user_id, course_id, name, weight) values ('${A}', '${courseA}', 'Homework', 100)`);
    await db.query(`insert into syllabi (user_id, course_id, storage_path, file_name) values ('${A}', '${courseA}', '${A}/x.pdf', 'x.pdf')`);
    await db.query(`insert into calendar_events (user_id, title, starts_at) values ('${A}', 'Study', now())`);
  });

  it("owner can read their own data", async () => {
    await as(A);
    expect((await db.query("select * from courses")).rows).toHaveLength(1);
    expect((await db.query("select * from assignments")).rows).toHaveLength(1);
  });

  it("another user sees nothing in any table", async () => {
    await as(B);
    for (const t of ["courses", "assignments", "assignment_grades", "grading_categories", "syllabi", "calendar_events", "profiles", "user_settings"]) {
      const r = await db.query(`select * from ${t}`);
      expect(r.rows, t).toHaveLength(t === "profiles" || t === "user_settings" ? 1 : 0); // B sees only their own profile/settings
    }
  });

  it("anonymous users see nothing", async () => {
    await as(null);
    expect((await db.query("select * from courses")).rows).toHaveLength(0);
  });

  it("another user cannot update or delete someone else's rows", async () => {
    await as(B);
    await db.query(`update courses set name = 'hacked' where id = '${courseA}'`);
    await db.query(`delete from assignments where id = '${assignA}'`);
    await asAdmin();
    expect((await db.query<{ name: string }>(`select name from courses where id = '${courseA}'`)).rows[0].name).toBe("IOE 310");
    expect((await db.query(`select 1 from assignments where id = '${assignA}'`)).rows).toHaveLength(1);
  });

  it("cannot insert rows owned by someone else", async () => {
    await as(B);
    await expect(db.query(`insert into courses (user_id, name) values ('${A}', 'spoof')`)).rejects.toThrow(/row-level security/);
  });

  it("cannot attach own rows to another user's course", async () => {
    await as(B);
    await expect(db.query(`insert into assignments (user_id, course_id, title) values ('${B}', '${courseA}', 'sneaky')`)).rejects.toThrow(/row-level security/);
    await expect(db.query(`insert into assignment_grades (user_id, assignment_id, points_earned) values ('${B}', '${assignA}', 100)`)).rejects.toThrow(/row-level security/);
  });

  it("cannot reassign own assignment into another user's category", async () => {
    await as(B);
    const catA = (await (async () => { await asAdmin(); return db.query<{ id: string }>(`select id from grading_categories limit 1`); })()).rows[0].id;
    const courseB = (await (async () => { await as(B); return db.query<{ id: string }>(`insert into courses (user_id, name) values ('${B}', 'Mine') returning id`); })()).rows[0].id;
    await expect(db.query(`insert into assignments (user_id, course_id, category_id, title) values ('${B}', '${courseB}', '${catA}', 'x')`)).rejects.toThrow(/row-level security/);
  });

  it("enforces one syllabus per course and cascades on course delete", async () => {
    await as(A);
    await expect(db.query(`insert into syllabi (user_id, course_id, storage_path, file_name) values ('${A}', '${courseA}', 'p', 'f')`)).rejects.toThrow(/duplicate key/);
    await db.query(`delete from courses where id = '${courseA}'`);
    await asAdmin();
    for (const t of ["assignments", "assignment_grades", "grading_categories", "syllabi"]) expect((await db.query(`select 1 from ${t}`)).rows, t).toHaveLength(0);
  });

  it("rejects invalid data via constraints", async () => {
    await as(A);
    await expect(db.query(`insert into courses (user_id, name, credits) values ('${A}', 'x', 99)`)).rejects.toThrow();
    const c = (await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', 'tmp') returning id`)).rows[0].id;
    await expect(db.query(`insert into grading_categories (user_id, course_id, name, weight) values ('${A}', '${c}', 'x', 150)`)).rejects.toThrow(/check constraint/);
  });
});

describe("storage policies", () => {
  it("restrict objects to the owner's folder", async () => {
    await as(A);
    await db.query(`insert into storage.objects (bucket_id, name) values ('syllabi', '${A}/c/1.pdf')`);
    await expect(db.query(`insert into storage.objects (bucket_id, name) values ('syllabi', '${B}/c/1.pdf')`)).rejects.toThrow(/row-level security/);
    await as(B);
    expect((await db.query(`select * from storage.objects`)).rows).toHaveLength(0);
  });
});

describe("canvas secrets", () => {
  let conn = "";
  it("owner can create a connection but cannot select the encrypted columns directly", async () => {
    await as(A);
    conn = (await db.query<{ id: string }>(`insert into canvas_connections (user_id, base_url, auth_type, access_token_enc) values ('${A}', 'https://canvas.example.edu', 'token', 'ciphertext') returning id`)).rows[0].id;
    await expect(db.query(`select access_token_enc from canvas_connections`)).rejects.toThrow(/permission denied/);
    expect((await db.query(`select base_url, status from canvas_connections`)).rows).toHaveLength(1);
  });
  it("owner reads secrets via the checked function; other users get nothing", async () => {
    await as(A);
    expect((await db.query<{ access_token_enc: string }>(`select * from canvas_secrets('${conn}')`)).rows[0].access_token_enc).toBe("ciphertext");
    await as(B);
    expect((await db.query(`select * from canvas_secrets('${conn}')`)).rows).toHaveLength(0);
    await as(null);
    await expect(db.query(`select * from canvas_secrets('${conn}')`)).rejects.toThrow(/permission denied/);
  });
  it("a Postgres upsert is NOT usable on connections (needs SELECT on secret columns); select-then-update/insert is", async () => {
    await as(A);
    await expect(db.query(`insert into canvas_connections (user_id, base_url, auth_type, access_token_enc) values ('${A}', 'https://canvas.example.edu', 'token', 'x') on conflict (user_id, base_url) do update set access_token_enc = excluded.access_token_enc`)).rejects.toThrow(/permission denied/);
    // what upsertConnection() does instead:
    expect((await db.query<{ id: string }>(`select id from canvas_connections where base_url = 'https://canvas.example.edu'`)).rows).toHaveLength(1);
    await db.query(`update canvas_connections set auth_type = 'extension', access_token_enc = null, refresh_token_enc = null, status = 'active' where id = '${conn}'`);
    expect((await db.query<{ auth_type: string }>(`select auth_type from canvas_connections where id = '${conn}'`)).rows[0].auth_type).toBe("extension");
  });
  it("users cannot create connections for someone else", async () => {
    await as(B);
    await expect(db.query(`insert into canvas_connections (user_id, base_url, auth_type) values ('${A}', 'https://x.edu', 'token')`)).rejects.toThrow(/row-level security/);
  });
});

describe("history and announcements", () => {
  it("are isolated per user and tied to owned parents", async () => {
    await as(A);
    const c = (await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', 'H') returning id`)).rows[0].id;
    const a = (await db.query<{ id: string }>(`insert into assignments (user_id, course_id, title) values ('${A}', '${c}', 'x') returning id`)).rows[0].id;
    await db.query(`insert into assignment_history (user_id, assignment_id, field, old_value, new_value) values ('${A}', '${a}', 'due_at', 'a', 'b')`);
    await db.query(`insert into course_announcements (user_id, course_id, canvas_id, title) values ('${A}', '${c}', '1', 'Hello')`);
    await as(B);
    expect((await db.query(`select * from assignment_history`)).rows).toHaveLength(0);
    expect((await db.query(`select * from course_announcements`)).rows).toHaveLength(0);
    await expect(db.query(`insert into assignment_history (user_id, assignment_id, field) values ('${B}', '${a}', 'x')`)).rejects.toThrow(/row-level security/);
    await expect(db.query(`insert into course_announcements (user_id, course_id, canvas_id, title) values ('${B}', '${c}', '2', 'x')`)).rejects.toThrow(/row-level security/);
  });
});

describe("idempotent upserts used by sync", () => {
  it("canvas assignments and notifications de-duplicate via ON CONFLICT", async () => {
    await as(A);
    const c = (await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', 'Sync') returning id`)).rows[0].id;
    const ins = () => db.query(`insert into assignments (user_id, course_id, title, canvas_assignment_id) values ('${A}', '${c}', 'HW', '99') on conflict (user_id, course_id, canvas_assignment_id) do nothing returning id`);
    expect((await ins()).rows).toHaveLength(1);
    expect((await ins()).rows).toHaveLength(0);
    // manual assignments (null canvas id) are never treated as duplicates
    await db.query(`insert into assignments (user_id, course_id, title) values ('${A}', '${c}', 'a'), ('${A}', '${c}', 'b')`);
    const n = () => db.query(`insert into notifications (user_id, kind, title, dedupe_key) values ('${A}', 'k', 't', 'same') on conflict (user_id, dedupe_key) do nothing returning id`);
    expect((await n()).rows).toHaveLength(1);
    expect((await n()).rows).toHaveLength(0);
    await db.query(`insert into notifications (user_id, kind, title) values ('${A}', 'k', 'x'), ('${A}', 'k', 'y')`);
  });
});

describe("course order (migration 0004)", () => {
  it("keeps each student's order independent, defaults new rows, and lets owners reorder only their own courses", async () => {
    await as(A);
    const ids: string[] = [];
    for (const n of ["One", "Two", "Three"]) ids.push((await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', '${n}') returning id`)).rows[0].id);
    await db.query(`update courses set sort_order = 3 where id = '${ids[0]}'`);
    await db.query(`update courses set sort_order = 1 where id = '${ids[2]}'`);
    await db.query(`update courses set sort_order = 2 where id = '${ids[1]}'`);
    expect((await db.query<{ name: string }>(`select name from courses where user_id = '${A}' and name in ('One','Two','Three') order by sort_order, created_at`)).rows.map((r) => r.name)).toEqual(["Three", "Two", "One"]);
    await as(B);
    await db.query(`update courses set sort_order = 99 where id = '${ids[0]}'`); // not B's course: silently affects nothing
    await as(A);
    expect((await db.query<{ sort_order: number }>(`select sort_order from courses where id = '${ids[0]}'`)).rows[0].sort_order).toBe(3);
  });
  it("backfill orders existing courses by creation time per student", async () => {
    await asAdmin();
    await db.exec(`update courses set sort_order = 0`);
    await db.exec(`update courses c set sort_order = s.rn from (select id, row_number() over (partition by user_id order by created_at, id) as rn from courses) s where c.id = s.id`);
    const r = await db.query<{ user_id: string; mx: number; mn: number; n: number }>(`select user_id, max(sort_order) mx, min(sort_order) mn, count(*)::int n from courses group by user_id`);
    for (const row of r.rows) { expect(row.mn).toBe(1); expect(row.mx).toBe(row.n); }
  });
});

describe("course websites (migration 0005)", () => {
  it("are private to their owner, https-only, one per course, and allow the 'website' source", async () => {
    await as(A);
    const c = (await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', 'Site') returning id`)).rows[0].id;
    await db.query(`insert into course_websites (user_id, course_id, url) values ('${A}', '${c}', 'https://eecs280.org/')`);
    await expect(db.query(`insert into course_websites (user_id, course_id, url) values ('${A}', '${c}', 'https://other.org/')`)).rejects.toThrow(/duplicate key/);
    const c2 = (await db.query<{ id: string }>(`insert into courses (user_id, name) values ('${A}', 'Site2') returning id`)).rows[0].id;
    await expect(db.query(`insert into course_websites (user_id, course_id, url) values ('${A}', '${c2}', 'http://insecure.org/')`)).rejects.toThrow(/check constraint/);
    await db.query(`insert into assignments (user_id, course_id, title, source) values ('${A}', '${c}', 'P1', 'website')`);
    await db.query(`insert into calendar_events (user_id, course_id, title, starts_at, source) values ('${A}', '${c}', 'Add/Drop', now(), 'website')`);
    await expect(db.query(`insert into assignments (user_id, course_id, title, source) values ('${A}', '${c}', 'P2', 'bogus')`)).rejects.toThrow(/check constraint/);
    await as(B);
    expect((await db.query(`select * from course_websites`)).rows).toHaveLength(0);
    await expect(db.query(`insert into course_websites (user_id, course_id, url) values ('${B}', '${c2}', 'https://x.org/')`)).rejects.toThrow(/row-level security/);
    await as(A);
    await db.query(`delete from courses where id = '${c}'`);
    await asAdmin();
    expect((await db.query(`select 1 from course_websites where course_id = '${c}'`)).rows).toHaveLength(0);
  });
});
