# CoursePilot

**Your entire semester, under control.** An AI-powered academic command center: courses, syllabi, assignments, calendar, and grades in one private workspace.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth, Storage, RLS) · Google Gemini · Vitest.

## Setup

1. **Install**: `npm install`
2. **Supabase** (free plan is fine)
   - Create a project. Copy the project URL and anon key into `.env.local` (see `.env.example`).
   - Apply the schema: for **each** file in `supabase/migrations/` in order (`…0001…`, then `…0002…`), copy its **entire contents** (not the file path) into the SQL editor and run it (or use `supabase db push`). They create all tables, RLS policies, the private `syllabi` storage bucket, the signup trigger, and Canvas/history/announcement support.
   - Auth → Providers → Email: keep enabled. Auth → URL Configuration: add `http://localhost:3000/auth/callback` (and your Vercel URL) as redirect URLs so confirmation and password-reset links work.
3. **Encryption key** (for Canvas tokens): `openssl rand -base64 32` → `CANVAS_TOKEN_ENCRYPTION_KEY`.
4. **Gemini**: create a key at https://aistudio.google.com/apikey → `GEMINI_API_KEY`. Set `GEMINI_MODEL=gemini-3.5-flash-lite` (verified as a Stable model ID on 2026-11-07; the app never substitutes another model, it errors if the variable is unset or the model is unavailable).
5. **Run**: `npm run dev` → http://localhost:3000, sign up, then *Settings → Load demo data* to explore.

## Speed: use the production build day to day

`npm run dev` is slow **by design** (it compiles each page on first visit, runs unoptimized code, and never prefetches). For normal use, run **`npm run prod`** (builds, then serves the optimized app on http://localhost:3000). Measured on real clicks (21 interactions, same account): 28 s before the optimization pass, ~13 s cold, and ~1.3 s once you hover a link before clicking (pages prefetch on hover).

What makes it fast: session checks are local (no network), every page starts all its queries together and shares them across the layout/page, course tabs load only the active tab, visited pages are cached client-side for 30 s, and links prefetch on hover. The main remaining cost is the round-trip distance to your Supabase project (150-300 ms per query from a distant machine). `PERF_LOG=1 npm run prod` logs every database call with timings; `npm run perf` measures real clicks.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Unit tests (grade engine, filters, dashboard logic, schemas, timezones) and RLS tests against the real migration (in-process Postgres) |
| `npm run test:gemini` | Live Gemini extraction check on `fixtures/sample-syllabus.pdf` (needs `GEMINI_API_KEY`, `GEMINI_MODEL`) |
| `npm run test:assistant` | Live AI Assistant check: real questions through Gemini + the tool loop on a fictional student |
| `npm run test:website` | Live check: crawl a real course site (default eecs280.org) and extract it with Gemini |
| `npm run e2e:website` | Real crawl + real database apply with overlapping items (needs migration 0005) |
| `npm run e2e:canvas` | Runs the real Canvas sync against your Supabase with a mock Canvas server (needs migration 0002) |
| `npm run e2e` | Core data journey against a real Supabase project incl. cross-user isolation (needs Supabase env; email confirmation off on the test project) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

## Architecture

- `lib/grades/`: **deterministic grade engine** (`calculations.ts`), letter scales, GPA. No AI ever computes a grade.
- `lib/ai/`: Gemini client (`gemini.ts`), prompts, Zod schemas. All AI output is validated before it is saved.
- `lib/actions/`: server actions (Zod-validated; RLS enforces ownership in the database).
- `app/api/syllabus/parse`: PDF → Gemini → validated JSON. PDFs go browser → Supabase Storage directly (avoids serverless body limits) and the route reads them with the user's own session.
- `supabase/migrations/`: schema + RLS. Tables for later phases (Canvas, notifications, AI chat) already exist.
- Grade types are always labeled: **Current** (graded work only, never treats ungraded as zero), **Projected** (assumed score on the rest), **Hypothetical** (your what-ifs, not saved).

See `BUILD_PROGRESS.md` for exactly what is built, tested, and still blocked.


**Canvas without an access token:** if your school blocks tokens, use the Chrome extension in `extension/` (see `extension/README.md`).

**Courses whose schedule lives on their own website** (e.g. EECS): open the course → **Course site** tab and paste the address.

Deploying: see `DEPLOY.md`.
