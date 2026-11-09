# Deploying CoursePilot (Vercel + Supabase)

## 1. Supabase (free plan)
1. Apply migrations in order from `supabase/migrations/` (SQL editor: paste each file's *contents*, run in order `…0001`, `…0002`).
2. Authentication → URL Configuration: set **Site URL** to your Vercel URL and add `https://YOUR-APP.vercel.app/auth/callback` to Redirect URLs.
3. Authentication → Email: turn **Confirm email** back **on** for real users, and configure **SMTP** (Resend, Postmark, etc.). Supabase's built-in sender is rate-limited (about 2/hour) and often blocked by school mail servers.
4. Storage: the `syllabi` bucket is created by the migration (private, 10 MB, PDF only).

## 2. Vercel
Import the repo, then set these **Environment Variables** (Production + Preview):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to expose (RLS protects data) |
| `GEMINI_API_KEY` | Secret, server only |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | Secret. `openssl rand -base64 32`. Changing it invalidates stored Canvas connections |
| `CANVAS_BASE_URL` | Optional default school URL |
| `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, `CANVAS_REDIRECT_URI` | Optional, only if your school gave you a Canvas developer key. Redirect URI must be `https://YOUR-APP.vercel.app/api/canvas/oauth/callback` |

Route time limits are declared in code (`maxDuration` 60s for syllabus parsing, Canvas sync, and the assistant). The Vercel Hobby plan allows that on current runtimes; if a large Canvas sync times out, sync one course at a time from the course page (the API accepts `courseId`).

## Speed: match regions
Every page makes a few database calls, and each costs one network round trip. In **Supabase → Project Settings → Infrastructure** note your project's region, then set the Vercel function region to the closest one (Vercel → Settings → Functions, or `vercel.json` `"regions": ["iad1"]`). Server-to-database round trips then drop from ~200 ms to ~5-20 ms, which makes the deployed app noticeably faster than local development.

## 3. After deploying
- Run `npm run e2e` against a **test** Supabase project (never production) to confirm isolation.
- Sign up, load demo data from Settings, and click through each page.

## Scheduled sync
Vercel Cron can't read users' encrypted Canvas tokens without a Supabase service-role key, which this app deliberately avoids. Instead, CoursePilot re-syncs automatically (in the background) whenever a student opens the app and their last sync is older than 3 hours.

## Security notes
- All tables have RLS; storage is private and folder-scoped by user id. Canvas tokens are AES-256-GCM encrypted server-side; the encrypted columns can't be selected by clients.
- Gemini and encryption keys exist only in server code (`server-only` modules).
- Canvas URLs are validated (https, public hostname) and the Canvas client refuses to send the token to any other host.
- Security headers are set in `next.config.ts`. A strict CSP is not set because Next.js inline scripts need nonces; add one if you host untrusted content.

## Canvas extension
If students use the browser extension, add your production URL to `extension/manifest.json` → `content_scripts[0].matches`, then reload the extension. Apply migration `…0003…` so extension connections are allowed. Extension syncs run in the student's browser, so they need Canvas open/logged in.
