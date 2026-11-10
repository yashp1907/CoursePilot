# CoursePilot Build Progress

_Last updated: 2026-11-07_

## Status

| Phase | Code | Verified |
|---|---|---|
| 1 Foundation | Done | **Live** (signup, login, RLS against real Supabase) |
| 2 Courses & Syllabi | Done | **Live Gemini extraction** (`npm run test:gemini`, 9/9 checks); upload flow used by you in the browser |
| 3 Assignments | Done | Used by you in the browser; filter logic unit-tested |
| 4 Grades | Done | Engine: 31 tests + live journey (`npm run e2e`); calculator used by you in the browser |
| 5 Canvas | Done | Logic unit-tested (client/pagination/rate-limit/mapping/reconcile/crypto); **real-sync executor test written (`npm run e2e:canvas`) but needs migration 0002 applied**; **never run against a real Canvas** |
| 6 AI Assistant | Done | **Live** (`npm run test:assistant`: 7 questions, correct tools, correct numbers); tools unit-tested; chat UI/route not yet exercised in a browser |
| 7 Planner, Notifications, Insights, GPA | Done | Pure logic unit-tested (scheduler, priority, workload, risk, GPA, notifications); UI not yet exercised in a browser; AI task breakdown route not yet exercised live |
| 8 Polish & deployment | Done (see limits) | Build/lint/typecheck clean; `DEPLOY.md` written; not load-tested |

**Tests:** 127 unit/integration tests (incl. RLS on the real migrations via in-process Postgres). Live scripts: `e2e`, `e2e:canvas`, `test:gemini`, `test:assistant`.

## Performance pass (measured, not guessed)
**Method:** timed real clicks in a production build (`npm run perf`, Chrome, same account) and logged every database call (`PERF_LOG=1`). Findings: each Supabase round trip is ~150-400 ms from here; `auth.getUser()` was a ~220 ms network call made twice per navigation; the course page made 13 mostly-sequential queries and re-rendered *all seven tabs* on every tab click; 42 `router.refresh()` calls re-rendered pages that server actions had already refreshed.
**Fixes:** (1) session via local `getClaims()` (JWT verified locally; DB still enforces RLS) in the proxy, pages, actions and API routes; (2) React `cache` on every fetcher so layout and page share queries, assignments **and** grades fetched in ONE embedded query, all page queries started together; (3) course page renders only the active tab (each tab's queries in parallel) with an instant skeleton on click; (4) removed redundant refreshes; (5) `staleTimes` client cache (30 s) + hover/focus/touch **full prefetch** on sidebar, mobile nav, course tabs and course cards; (6) per-route loading skeletons so every click paints immediately.
**Results (21 real interactions, median):** 28.0 s -> 13.0 s cold (first visit of a page ~0.8 s, the DB round-trip floor; course open 2.3 s -> 0.8 s; each course tab 2.3 s -> 0.8 s) -> **1.3 s with hover** (clicks ~45 ms). Revisits ~50 ms. All displayed numbers verified identical before/after (GPA 3.30, each course grade, category breakdown).
**Still the floor:** distance to the Supabase region. On Vercel, set the function region next to Supabase (see DEPLOY.md).

## Course info polish from real data
- Quick links are **curated at display time** (so existing courses benefit without a re-sync): Canvas's own navigation (Home, Grades, People…), Canvas accessibility boilerplate ("Links to an external site."), duplicates and "Download X" twins are removed; forums/Gradescope/meetings/autograder first, textbooks last; ~9 shown with "Show N more". Navigation is only recognized on the school's own Canvas host (learned from its tab URLs), so a real tool at e.g. gradescope.com/courses/9 is never dropped.
- Schedule rows: "Tuesdays and Thursdays" → "Tue/Thu", generic titles ("Class Time") hidden, section as a small badge, notes clamped to one line; the card is no longer stretched to match its neighbor.
- The prompt now also tells Gemini not to list Canvas navigation, so new reads are cleaner at the source.

## Whole-course Canvas scrape (course info)
- **What is read per course on every Canvas sync** (token and extension paths share one collector, `extension/lib/course-info.js`): syllabus tab, front page + up to 7 relevant pages (syllabus/schedule/staff/contact/office hours/policies/…), **staff list**, sections, calendar events, course tabs and external tools (Gradescope/Ed/Zoom…), module outline. Text size-capped; each part best-effort.
- **Privacy:** only `teacher`/`ta`/`designer` enrollments are requested (custom roles like GSI/IA ride on those); anyone without a staff enrollment is dropped; student rosters are never requested or stored (tested, incl. a student returned by the server being discarded).
- **Fast sync, then understanding:** sync stores the raw text + a content hash and marks only *changed* courses pending; a background step (`/api/canvas/course-info`, one course per call, run automatically after every sync) has Gemini turn the text into validated facts: class times/rooms (lecture/lab/discussion/office hours/exams), people with roles (instructor / GSI / IA / grader / coordinator) + emails + office hours, contacts, tool links, textbooks, key facts, policies, summary. Canvas's staff list is authoritative; the AI adds what the pages say; page-only people are labeled "from page". Links and emails are validated (https only).
- **Fills blanks only:** empty course fields (professor, email, office hours, classroom, description) are filled from it; nothing you entered is overwritten.
- **Shown in** (compact layout, verified in light/dark/mobile screenshots): a **Course info** tab: a one-glance summary strip with key facts, a one-line-per-meeting **Schedule** (with "Today" badges), merged **Quick links** chips (contacts + tools), a dense **Teaching team** list (emails with click-to-copy, office hours inline, "today" badge, filter for big teams, long groups collapse, copy-all-emails), and one **More details** accordion (policies, grading/facts/textbooks, outline, sections) that stays folded until needed, a compact summary on the Overview, a **Today's classes** dashboard card, command-palette shortcuts.
- **Assistant:** new `get_course_info` tool: "who's my GSI?", "when/where is lecture?", "office hours?", "what's the Ed link?" answered from stored facts (live-tested), with a clear "not in the course info" when it isn't there.
- **Tests:** 273 total (collector incl. privacy and caps, HTML→text, role mapping, merge rules, link/contact validation, fill-only, day parsing, assistant tool, RLS-style schema checks). `npm run e2e:canvas` now also covers the full pipeline against your database **once migration `…0006…` is applied** (currently skipped, not failed).
- **Not read:** Canvas Files (e.g. a syllabus PDF only attached as a file), discussions, quizzes, hidden tabs, anything the school hides from students.

## Course websites (EECS-style courses whose schedule lives on their own site)
- **Where:** a **Course site** tab on each course (paste the address → read → review → import) plus a **Course websites** overview on the Integrations page. Per-course, because each course has its own site.
- **How it reads a site** (`lib/website/`): fetches the page you give plus a few same-site pages (schedule, syllabus, policies, assignments), keeping tables as aligned rows and links inline; skips archives, staff pages, files and other sites; honors robots.txt; flags JavaScript-rendered or login-protected pages instead of guessing.
- **How it extracts:** Gemini with the same validated schema as syllabi (so the same review screen and no-overlap logic apply), plus site-specific rules: lectures, review sessions, office hours and "No class" days are not assignments; alternate/make-up exam sittings aren't assignments; project checkpoints are separate items; "out"/"due" uses the due date; each item's spec link is attached.
- **Deterministic safety nets:** schedules omit the year, so the model copies the printed weekday and code verifies the year (only a neighboring year may correct it; otherwise the item is flagged). Links are made absolute https; duplicates and untitled rows dropped; far-off dates warned.
- **Re-checking:** "Check for updates" skips the AI call if the pages are unchanged (content hash). A newer site date may correct an older **syllabus/website** date (shown on the review screen, recorded in history, with a notification), but never a **Canvas** item, a **manual** item, or a date **you edited**. Existing items are matched, never duplicated; Canvas later adopts website items like syllabus ones.
- **Live result on the real eecs280.org** (`npm run test:website`): 2 pages read; 11 assignments with correct dates/times/years (projects + checkpoint, midterm, final, surveys), spec links attached, alternate exams kept out, 7 registrar/holiday dates, grading 10/39/25/25/1 = 100%, late policy; no warnings.
- **Security:** https + public hostnames only; DNS checked at connection time (blocks private IPs and DNS rebinding); every redirect re-validated; size/time limits.
- **Tests:** 241 total (HTML reader, link picking, SSRF/robots, weekday-year, post-processing, date-change planning, RLS for the new table). **Not run yet:** `npm run e2e:website` (real crawl + real database apply with overlapping syllabus/Canvas items), which needs migration `…0005…`.
- **Limits:** public pages only (no login), no JavaScript-rendered content, no PDFs/Google Docs/Calendar embeds (e.g. EECS 280's exam info is a Google Doc; the schedule itself is read fine).

## Course order, color coding, and UI polish (latest round)
- **Reorder courses:** My Courses → **Reorder** (drag cards, or arrow buttons for keyboard/touch). Saved per student and used by the sidebar everywhere. Needs migration `…0004…` (until applied, the UI works but shows a clear "apply migration" message and reverts; nothing else breaks).
- **Color coding:** 12-color palette + any custom color; change from the swatch on each course card, or in the course form. A course's color now shows on cards, sidebar, course header, assignment lists, board cards, calendar chips, dashboard deadlines and week strip, planner, grades table, and Insights bars. Text in a course color is blended with the theme foreground so it stays readable in light and dark.
- **UI pass, verified in a real browser (light, dark, mobile screenshots):** course cards with grade rings and accent bars; dashboard stat cards with icons; deadlines grouped Overdue / Today / Tomorrow / This week / Later; richer week strip; Assignments list sectioned by urgency with completed work collapsed; grade tools as tabs (Your grades / What-if / Target / Scheme) instead of one very long page; course header with a color identity; larger minimum text sizes; duration formatting fixed ("48m", not "0h 48m").
- **Tested:** 216 tests; live browser checks (`scripts/ui-interact.mjs`): recolor persists and reaches the sidebar, custom hex works, reorder moves instantly.

## No overlap between Canvas, syllabus and manual items
- **Meaning-based matcher** (`lib/match.ts`): HW 4 = Homework 04 = Problem Set 4; Midterm = Midterm Exam 1; Final = Final Examination; but Homework 4 ≠ Homework 5, Quiz 1 ≠ Homework 1, Midterm ≠ Final. Uses kind + sequence number + wording + (where it helps) dates; one-to-one; ambiguous ties are never guessed. Manual items need a near-certain match.
- **Canvas sync adopts, never duplicates:** a new Canvas assignment that matches an existing syllabus/manual one is *linked* to it (Canvas id stored, Canvas becomes authoritative for date/points on syllabus items; your category, notes, priority and type are kept; manual items keep all your values and report conflicts). Personal study tasks are never adopted. Link recorded in history.
- **Syllabus import plans against everything you have:** skips items already in Canvas / your list, collapses repeats inside the syllabus, skips "weekly quizzes"-style entries once Canvas lists the individual quizzes, and **fills only blanks** (e.g. an exam date Canvas left empty). The review screen shows each item's status ("Already in Canvas: …", "Will fill missing date") and pre-selects only new items.
- **A Canvas "no value" never erases** a date/points/notes you already have.
- **Duplicate review & merge** for overlaps created before this: banner on Assignments/course pages, merge keeps the Canvas item and carries over category, notes, estimate, priority, progress and grades; "Not a duplicate" is remembered. The server refuses to delete a Canvas-linked item.
- Category names match by meaning too ("Homework" ~ "Homework Assignments", "Quizzes" ~ "Quiz").
- **Tested:** 207 tests (66 for matching and the full-flow no-overlap properties: syllabus→Canvas, Canvas→syllabus, repeated runs idempotent); live `e2e:canvas` against real Supabase now also covers adoption, history, protected edits and study tasks. The live run caught that far-apart dates wrongly blocked a midterm match; fixed.

## Canvas via browser extension (added after your token was blocked)
Your school disables student access tokens, so Canvas can also be synced with a small Chrome extension (`/extension`): it fetches **your own** Canvas data using your logged-in Canvas session (read-only, one granted host), and your CoursePilot tab uploads it to `/api/canvas/ingest`, which runs the **same reconcile logic** (no duplicates, edits/grades protected, deadline-change notices). No credentials of any kind are passed to CoursePilot.
- Verified: 140 tests (extension fetch core: pagination, `while(1);` prefix, logged-out detection, backoff, cross-host guard; ingest validation; `javascript:` URL blocking; payload source). `npm run e2e:canvas` also covers the payload path.
- **Not verified:** the extension has never run in a real browser against your real Canvas. Whether Canvas accepts cookie-authenticated API calls is school-dependent (the popup's Test button tells you). Needs migration `…0003…`.
- Policy: this reads only your own data through your own login; if your acceptable-use policy limits automation, check first. Asking Canvas admins to generate a token is the other route.

## What changed in this round
- **What-if calculator rebuilt:** every assignment is listed by category (weight, current average → what-if average); any item can be overridden, including already-graded ones; bulk "set all ungraded in this category"; categories with no assignments get a stand-in row; result shows change vs current. Projected and hypothetical stay labeled.
- **Navigation:** courses nested in the sidebar, ⌘K search/jump palette (pages, courses, assignments, actions), global **Add** menu, notification bell, mobile bottom tab bar, skip link, quick access to a course's Grades/Syllabus tabs.
- **Canvas (Phase 5):** token connect + OAuth (if your school gives a developer key), encrypted tokens, SSRF-safe URL validation, pagination, rate-limit backoff, token refresh, course auto-link/create, assignment groups → categories, assignments, submissions → status, posted grades, announcements, change detection with history + notifications ("IOE 310 Homework 4 deadline changed from November 12 to November 14."), never overwrites your edits/grades (reports conflicts), idempotent upserts, sync history UI, auto-resync after 3h.
- **AI Assistant (Phase 6):** Gemini function-calling over 9 deterministic tools (grades via the real engine, what-ifs, target grades, syllabus, deadlines, workload, priorities, Canvas changes); citations come from tool results, not the model; conversation history; course-context selector; per-course assistant tab; rate limits.
- **Phase 7:** Study Planner (availability, EDF day plan, at-risk warnings, explainable priorities, workload by week, AI + manual task breakdowns), notifications (capped, deduped, preference-aware), Insights (risk flags with reasons, grade trends, course comparison, completion, workload; each with a data table), GPA simulator (UMich scale only when selected, custom scales, cumulative).
- **Phase 8:** loading skeletons, error boundary (detects an out-of-date database), 404, security headers, accessibility pass (labels, roles, skip link, keyboard palette), deployment guide.

## Bugs found by live testing this round
- `e2e` (real Supabase) exposed that bulk inserts with differing keys send NULL for missing keys (defeating defaults). Fixed the demo-data calendar insert; app code elsewhere uses uniform rows.
- Partial unique indexes can't be used by `ON CONFLICT`; this would have broken retried syncs and notification de-duplication. Replaced with plain unique indexes (covered by RLS tests).

## You still need to do
1. **Apply migrations `…0002…` through `…0005…` in order** (…0004 = course order, …0005 = course websites, …0006 = Canvas course info) (SQL editor; paste contents). Until then Canvas, history, announcements, notifications availability and planner availability saving won't work (the app degrades gracefully but those features are off).
2. Run `npm run e2e:canvas` after that.
3. Canvas: needs a real school account to confirm against actual Canvas data (paste an access token in Integrations). OAuth needs a school-issued developer key (many schools don't give students one).

## Known limitations
- No browser-automation (Playwright) tests; UI verified by build/types/lint and your manual use.
- No Vercel Cron: scheduled sync needs a service-role key, which this app avoids. Replaced with background re-sync on app open (>3h stale).
- Canvas sync runs all courses in one request (60s limit); very large accounts may need per-course syncs (API supports `courseId`).
- Assignment history is stored and used by the assistant/notifications but has no dedicated UI yet.
- Email/push notifications and Google Calendar are not implemented (notification drafts are channel-agnostic so they can be added).
- Study estimates use labeled defaults by assignment type when you haven't set your own.

## UI refresh and dark mode
- Theme system: Light / Dark / System (`lib/theme.ts`, `components/ui/theme-toggle.tsx`). Set before first paint by an inline script, so there is no flash. It's saved per browser, follows the OS in System mode, and is available from the header menu, Settings → Appearance, and the ⌘K palette.
- All colors are tokens in `app/globals.css` (`:root` light, `:root[data-theme="dark"]` dark), plus shared shadow tokens. Charts, toasts, dialogs and course colors are theme-aware.
- Polished: buttons, inputs, cards, dialogs (motion), tabs (underline no longer clipped), sidebar active state, frosted header and mobile bar, branded split-screen login/signup, course-colored planner blocks, calendar chips, dashboard stat cards on mobile.

## Color themes and motion
- 7 accent themes (Indigo, Ocean, Forest, Sunset, Rose, Violet, Graphite), each with a light and dark version that also re-tints the surfaces. Chosen in Settings → Appearance (`data-accent` on `<html>`, saved in `cp-accent`, applied before first paint). Contrast checked: text-on-surface ≥ 4.5:1 for every theme and mode.
- Progressive CSS: aurora hero, pointer spotlight on cards, count-up numbers (`@property`), drawing rings/bars, shimmer skeletons, scroll-driven header, dot-grid backdrop. All respect "reduce motion".

## Mobile / PWA
- Installable PWA: `app/manifest.ts`, icons in `public/icons` (any + maskable + Apple), service worker `public/sw.js` (static assets + offline page only), offline page, in-app install banner and Settings → Install card (Android prompt / iOS instructions).
- Touch UX: safe-area insets, bottom tab bar (Home, Courses, Assignments, Calendar, More), dialogs become bottom sheets on phones, 44px touch targets on coarse pointers, 16px inputs (no iOS zoom), pull-to-refresh, offline banner, collapsible filters, denser rows.
- Verified in an iPhone-sized touch browser: no horizontal overflow on any page, SW activates and controls the page, offline navigation shows the offline page.

## Liquid Glass style
- Settings → Appearance → **Style**: Classic or Liquid Glass (`data-style="glass"` on `<html>`, key `cp-style`). Independent of mode and the 7 color themes.
- Design notes (what makes the real thing work, approximated in CSS): a light source (directional inset rim highlights `--rim`, diagonal `--sheen`, corner lamp), colourful content behind (drifting accent mesh), vibrancy (backdrop blur + saturate), floating capsule shapes (sidebar/header/mobile dock, pill buttons and segmented controls), springy `linear()` motion with lift on hover and squish on press.
- Surfaces read the accent-tinted solid tokens and make them translucent, so every palette keeps its identity. Graphite gets a calmer backdrop.
- Contrast was measured programmatically (text colour vs. the rendered pixels behind each text run, ignoring occluded text) across 7 themes x light/dark x 9 pages; tokens (`--muted-foreground`, `--destructive`, `--warning`, `--success`, accent text) are tuned in the glass block. Course chip text (`readable()` in lib/utils/colors.ts) was deepened for both styles.
- Respects `prefers-reduced-motion` and `prefers-reduced-transparency`; solid fallback without `backdrop-filter`.
- Fixes found on the way: global border colour moved into `@layer base` (so `border-primary` etc. apply); phone sheet dialogs now slide up from the bottom (the old `max-sm:anim-sheet` class never applied because Tailwind variants don't work on plain CSS classes).
