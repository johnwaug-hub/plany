# Plany — Claude Project Instructions

## Project Overview
- **App Name:** Plany
- **Firebase Project ID:** plany-waugs
- **Live URL:** plany.work
- **Owner:** John Waugaman (Grade 1 Teacher, Tucson, AZ)
- **Current Version:** v5.23.0

Plany is a lesson planning and classroom management PWA built for teachers. John is both the
developer and the primary user. Claude serves as the development partner.

---

## Tech Stack
- **Frontend:** Vanilla JavaScript (no framework)
- **Backend:** Firebase (Firestore, Auth, Hosting)
- **Native:** Capacitor 6 (iOS + Android)
- **AI:** Anthropic API (claude-sonnet-4-6 for packets, claude-haiku for bulk fill)
- **PDF:** PDF.js, JSZip, DrawingML XML parsing for .pptx

---

## Session Workflow
The source folder `C:\Plany` is connected directly to the session — **there is no ZIP step.**
Work on the files in place with the device shell; do not stage files into the cloud workspace
just to read or edit them.

1. Read the relevant code before changing anything (`public/js/app.js` is ~19k lines — grep, don't dump)
2. Implement the change in place, editing with a command or short script rather than retyping files
3. Bump the version (see below) and add a changelog entry to `README.md`
4. Run `node --check` on any edited JS before deploying
5. Deploy and verify live

**Deploy:**
```
firebase deploy --only hosting --project plany-waugs
```
The Firebase CLI is installed on John's Windows machine and authenticated via `firebase login`.
The CLI is *not* available in the connected folder's Linux shell.

---

## Repo Layout
- `public/` — the Firebase Hosting root
  - `public/js/app.js` — the entire application, single file
  - `public/index.html` — all markup and inline styles
  - `public/css/styles.css`
  - `public/sw.js`, `public/manifest.json`
- `functions/` — Cloud Functions (authenticate via ADC; no service-account key file)
- `_backups/` — dated `.bak-<version>` copies of app.js / index.html / styles.css
- `android/` — Capacitor Android project

---

## Version Numbering
- **Patch bump** (x.x.X) — bug fixes
- **Minor bump** (x.X.0) — new features

Every release must update **all four** in lockstep:
1. `public/manifest.json` → `"version"`
2. `public/sw.js` → both the header comment and `CACHE_NAME`
3. `public/index.html` → `<span class="nav-version">`
4. `public/js/app.js` → the header comment on line 1

Plus a changelog entry at the top of `README.md`.
(`package.json` carries a stale version and is **not** used for release versioning — ignore it.)

---

## Architecture & Key Systems

### Date Anchors — three globals, always synced
`currentDate` (month view), `currentWeekStart` (always a Monday), `currentDayDate` (day view).
Any "jump to a date" action must set **all three**, or a later view switch lands on a stale date.
This applies to all three Today buttons and the `T` keyboard shortcut.

### Week Start Convention
`getWeekStart()` returns `d.getDate() - day + 1`. **Sunday is the FIRST day of its week**, not the
ISO tail of the previous one — this matches the Sunday-first month grid and the Sun–Sat week columns.
Do not "fix" this back to the ISO rule (`day === 0 ? -6 : 1`); that regression makes "Today" on a
Sunday jump to the school week that already ended.

Week view renders `offsets = hideWeekends ? [0..4] : [-1..5]`, so 7-day mode shows Sun–Sat with
Sunday at offset −1. Any label or range check must match those offsets, not a blind Mon–Sun span.

### No-School Detection
- `isNoSchoolEvent()` is the **single source of truth** for all no-school logic
- Both `isOffDay()` and `countSchoolDaysLeft()` route through it
- Covers: break, holiday, grading, meeting, professional-learning event types
- Lesson dots suppressed and calendar days dimmed outside school year boundaries

### Sub Day System
- Badge appears only when `subDays[dateStr]?.isSubDay === true` (not just key presence)
- Sub Day Packet includes per-class instructions, computer time, and defaults

### AI Features
- **AI Lesson Fill** — bulk generates lesson fields across a date range (`claude-haiku`)
- **AI Student Work Packet** — streaming, live status, 16,000 max tokens (`claude-sonnet-4-6`)
- **AI Year Newsletter** — reads from uploaded pacing documents
- Generates content even when no curriculum is uploaded

### AI Key Storage — device-local with a cloud backup
The provider API key lives in `localStorage` under `ai_key_<provider>`, so it is **per-browser and
per-device**. Three functions keep it usable everywhere; all three must stay wired up:
- `syncMySharedKeyDoc()` — writes `apiKeyShares/{uid}` (also powers "share my key" with colleagues)
- `restoreAiKeyFromCloud()` — on login, pulls that doc down when this device has no key saved
- `ensureAiKeyCloudBackup()` — on login, writes the backup when this device has a key and the
  cloud copy is missing or stale

All three are awaited before `applyAiFeatureGating()` in `loadSchoolYearData()`. If AI works on one
device and not another, check that `apiKeyShares/{uid}` exists before looking anywhere else.

`ai_packet_grade` and `ai_teacher_name` are read but never written — vestigial, safe to ignore.

### Curriculum Library
- PDF (PDF.js), ZIP unpacking, `.pptx` text extraction (JSZip + DrawingML)
- Stored at `users/{uid}/curriculum` — **not year-scoped** (intentional, persists across years)
- Real-time sharing between teachers via the `sharedCurriculum` collection

### School Year Logic
- End-of-year banner + new year modal with class copy system
- School year transition is a defined flow, not automatic

### Print Output
- Uses `window.open` + `document.write` HTML print (not jsPDF); CSS **table** layout, not grid
- **Every print view must pass its HTML through `preparePrintDoc(html, {v, h})`** or the browser
  stamps its own header/footer into the page margin band
- Margins: `h` is **0.3in on every call site**, no exceptions. `v` is 0.4in (0.5in for the single
  lesson plan, year newsletter and anchor charts)
- **Never** set left/right `body` margin/padding or a fixed `max-width` inside a print document —
  those stack on top of the shell's `h` padding. The shell owns horizontal margins
- **No Plany branding in printed output** — no "Generated with Plany", no "plany.work" footer or
  badge, no "From <teacher>" byline. Date stamps are fine
- `sanitizeForPDF()` replaces non-Latin-1 Unicode (e.g. `→`) with ASCII equivalents
- See `claude/print-shell-notes.md` for the full mechanism

### Capacitor / Native
- Splash dismissed via custom `plany:auth-resolved` event after Firebase auth resolves
- Android and iOS icons, splash screens, and signing scripts are in place
- Google Play Store submission is the current next step

---

## Security
- **No credentials in these instructions, in project docs, or in the repo.** Deploys authenticate
  through `firebase login` on John's machine; Cloud Functions use ADC
- If a task genuinely needs a service-account key, use one scoped to the single role required and
  keep it out of anything that syncs into a Claude project

---

## Classroom Tools John Uses
Prodigy Math, iReady, Seesaw, Starfall, Khan Academy Kids

---

## Key Rules
- Read the existing code before writing changes
- Never scope the curriculum library to a school year
- Keep `isNoSchoolEvent()` as the single gatekeeper for all no-school logic
- Sub day badge condition: `subDays[dateStr]?.isSubDay === true`
- Sunday starts its week — see Week Start Convention above
- All three date anchors move together
- AI packets: 2 activities per class period
- Service worker cache version = app version (always)
- All print output goes through `preparePrintDoc()`, side margins 0.3in, no app branding
- Test incrementally — don't batch all changes before reviewing
