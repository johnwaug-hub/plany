# PLANY v5.22.0 - Lesson Planning PWA

A modern lesson planning app for teachers with an 80's inspired design.

## What's New in v6.6.0 - Shift Lessons, Share Links 🔗⏩

- **⏩ Shift lessons** (Day view → ⏩ Shift). Push lessons later after a snow day or lost day, or pull them
  earlier, by 1–5 class days, for one class or all of them. Lessons move along each class's own meeting days
  (schedule, every-other-week, sessions per day), skipping holidays and breaks; order and gaps are kept. A
  preview says how many lessons move, and it refuses (instead of dropping lessons) if any would run past the
  last day of school. **Ctrl+Z undoes it.**
- **📌 Lock to date**: a checkbox in the lesson form keeps a lesson (field trip, assessment) on its date when
  others shift around it.
- **🔗 Share links** (Week view → 🔗 Share, or 🔗 in a saved lesson). Makes a read-only copy anyone can open at
  `plany.work/s/…` with no account -- handy for a principal, co-teacher or sub. Links last 30 days, can be turned
  off any time from the share window, and contain only lesson-plan fields (never students). The page prints
  cleanly without Plany branding or your name.
- **Android versions stay in sync:** `npm run cap:version` (and `npm run cap:sync`) copy the release version
  into the Android build (`versionName` 6.6.0, `versionCode` 60600) -- it had been stuck at 5.11.9 / 1.
- Tests: 12 (added shift-planning cases).
- **Deploy:** rules and hosting changed -- `npm run deploy`.

## What's New in v6.5.0 - Audit Clean-Up 🧹

The rest of the v6.0.1 audit's code items.

**Security & libraries**
- **PDF.js 4.10.38** (legacy build for older classroom devices) replaces 3.11.174, served from plany.work
  (`public/vendor/pdfjs/`) so its worker runs same-origin.
- **Content-Security-Policy**: scripts only from plany.work and the CDNs Plany uses; no plug-ins; no framing.
- `npm run deploy:preview` publishes to a 7-day preview URL for testing before going live.

**Data safety**
- School-year loads run one at a time, in order, and are dropped if the account changed -- a slow earlier load
  can no longer overwrite newer data. Classes, lessons, events and breaks load in parallel (faster).
- Redo after deleting a lesson removes exactly the restored lesson (it matched by title + date).
- Saving a lesson missing from the local list no longer writes `lessons[-1]`.
- A partly failed bulk curriculum delete removes what did delete from the list and says how many failed.

**Correctness**
- Pacing cells like "Day 2 & 3" merge both lessons into that day's lesson instead of dropping the second.
- The year newsletter includes every key date (was 20), uses `isNoSchoolEvent()`, can't crash on an event with
  no date, and samples every pacing document per subject.
- While a principal previews a teacher, the N/E/C and undo/redo shortcuts are off (they wrote to the
  principal's own account).
- ✕ on a shared resource removes it from the inbox. Toasts each get their full time on screen.
- PDFs are released from memory after use; switching resources in the page picker stops the old render.
- Classes with several sessions show every session's lesson in Week/Day PDFs and summaries.

**Printing**
- Newsletter, attendance and seating printouts no longer add their own side margins or a fixed width on top of
  the print shell; weekly/monthly newsletters use 0.4in (year newsletter 0.5in).

**Phone apps**
- Signed-out launches dismiss the splash screen right away.
- Android Back steps out one layer at a time (dialog, popup, More menu, Help, then Month) and only exits from
  Month.

**Accessibility & design**
- Form fields get names: loose labels are connected to their field, and unlabeled fields use their placeholder,
  tooltip or neighbouring text. The hidden Help panel can no longer be tabbed into.
- 89 colour literals in styles.css now use the design tokens (identical values); the light Material colours in
  the sub-day buttons and the import badges use dark-theme tokens.
- Help screenshots are WebP (518 KB → 218 KB).

**Deploy:** `npm run deploy` (hosting headers changed).

## What's New in v6.4.0 - Principal Feedback, Phone Nav, Real Dialogs 💬

- **Principal feedback inbox.** Comments your principal leaves on your lessons now reach you: a 💬 button in
  the header shows an unread count, opens the list, and links each comment to its lesson. Opening it marks
  them read (the Firestore rule lets a teacher change only `read`/`readAt`).
- **Phone navigation:** on screens under 600px the bottom bar is Month · Week · Day · AI · ☰ More, with Year,
  Classes and Students in the More menu. No more "CLASSESSTUDENTS".
- **Styled dialogs instead of browser pop-ups.** All 20 confirmations and the document preview use Plany's
  own dialog (`planyConfirm()` / `planyAlert()`). Delete questions focus **Cancel** so a stray Enter can't
  delete anything; Esc cancels.
- **Account switching is clean:** friend, shared-lesson and shared-resource listeners now start after sign-in
  (they could miss a fresh login) and stop on sign-out; a shared AI key, the curriculum library, inboxes and
  badges from the previous account are cleared.
- **Shared PDFs work in the recipient's page picker** (the file link is now included), and an imported shared
  resource keeps only known fields -- never the sender's storage path.
- **Deploy:** rules changed -- `npm run deploy`.

## What's New in v6.3.2 - One AI Key Everywhere 🔑

- **Fixed: "API key is invalid" on the classroom board.** A device holding an old key kept using it, and on
  sign-in it even copied that old key over your account backup, so the backup flipped between old and new
  keys depending on which device signed in last. Now the account backup is the source of truth: it only changes
  when you click **Save Key**, and every device switches to it when you sign in.
- If the AI provider still rejects a device's key, Plany checks your account backup, switches to the saved key
  and retries automatically.
- A rejected key now says so plainly and tells you where to paste a new one.
- Hosting only: `npm run deploy:hosting`.

## What's New in v6.3.1 - AI Works From www.plany.work 🔧

- **Fixed: "Anthropic Claude API error 403" on other devices.** Plany also answers at `www.plany.work`, but the
  AI proxy only accepted `plany.work`, so AI failed on any device that had opened the www address. The proxy
  now accepts both, and `www.plany.work` redirects to `plany.work` so there's one sign-in and one saved key.
- AI errors now say what went wrong and what to do (sign in again, check your key, try again later) instead of
  a bare status code.
- **Deploy:** functions changed -- `npm run deploy` (or `npm run deploy:functions` then `npm run deploy:hosting`).

## What's New in v6.3.0 - Saved AI Work, Phone Calendar, Accessibility 💾📱

**Everything the AI writes is saved where you made it** (`users/{uid}/years/{year}/aiOutputs`)
- **Newsletters** (week, month, year) and **anchor charts** are saved per week/month/year and shown again
  when you reopen them, with the date they were made. Generating again replaces the saved copy.
- **Quizzes, rubrics and differentiation plans** are saved to a list under each generator: open one to see
  or re-print it, or delete it.
- **Teaching stats** are saved as soon as they're calculated (they used to vanish unless you saved the
  profile form).
- Lesson Fill, student packets, the curriculum generator and the calendar/pacing imports already saved
  into your lessons, sub days and events.

**Phone month view**
- Below 600px each day shows one dot per class (filled = planned, hollow = not yet) plus a square per event;
  tap anywhere on the day to open it. The inline style block that forced 7px text is gone.
- Pinch-zoom works again. The version tag no longer crowds the bottom nav on phones. Empty week-view days
  say "No classes" instead of "No classes today".

**Accessibility**
- Every popup is a real dialog: focus moves into it, Tab stays inside, and focus returns to the button that
  opened it (on touch screens it doesn't pop the keyboard).
- Calendar days can be reached with Tab and opened with Enter; screen readers hear e.g. "Tuesday, October 6,
  3 of 5 classes planned, 1 event".
- Icon-only buttons (×, 🖨️, ✕…) have spoken names; toasts are announced; animations respect "reduce motion".

**Faster loading**
- PDF.js, jsPDF, SheetJS and JSZip (about 1 MB) no longer block the login screen. They load when a feature
  needs them and quietly in the background a few seconds after sign-in.
- The home-screen shortcuts **Add Lesson** and **This Week** now work. Manifest gains `id`/`scope`, and the
  theme colour matches the app.

**Behind the scenes**
- **Version control:** `C:\Plany` is now a git repository (`git log` to see history). `_backups/` is no
  longer needed going forward.
- **Tests:** `npm test` checks the date and no-school logic and the HTML-escaping helpers (runs in Arizona
  time). `npm run deploy` and `npm run deploy:hosting` run the tests first and stop if one fails.
- **Error reports:** uncaught errors are logged to the `clientErrors` collection (view in the Firebase
  console) -- at most 10 per page load, never shown to other users.
- Offline caching (Firestore persistence) was already on; no change needed.

**Deploy:** rules changed (new `clientErrors` collection) -- run `npm run deploy`.

## What's New in v6.2.0 - Correctness Pass ✅

Phase 2 of the v6.0.1 audit. Hosting only -- no rules or functions changes.

**Calendar & dates**
- **School-days-left and the year totals use `isNoSchoolEvent()`.** The first and last day of school now
  count as school days (they were subtracted), "Breakfast"-style titles no longer remove days, and the four
  quarters add up to the total (boundary days were counted twice). "Induction" titles count as no-school.
- **No-school days are respected everywhere:** Year-view shading (meetings, professional learning and
  title-only holidays were missed; lesson dots are hidden on off days), weekly recurring lessons, curriculum
  stubs, Excel-import dates (also now stay inside the first/last day), and the Week/Day PDFs ("No school").
- **Month arrows no longer skip months** on the 29th–31st, and moving the month no longer drags the Day view.
- **New `jumpToDate()` / `renderAfterJump()`**: the T shortcut, search results, Copy Week and the principal
  preview's Prev/Today/Next all move all three date anchors and redraw the view that's showing. Search
  results open on the right day in Arizona (they parsed dates as UTC). Exiting a teacher preview restores
  the principal's own dates.
- **Copy Week copies the days the week view shows** (Sun–Sat or Mon–Fri) instead of Mon through next Sunday.
- Messages, the week-PDF file name, the backup file name and Teams due dates use local dates, not UTC.

**AI**
- **Student packets skip classes with "📝 AI work" unticked,** always ask for exactly 2 activities per class,
  and are saved to the date they were generated for (opening another day during generation used to lose it).
- **A cut-off or failed AI stream is no longer saved as finished.** Mid-stream errors are shown, empty
  responses are rejected, and hitting the length limit shows a warning.
- AI Lesson Fill fills the **Learning Target** field (it wrote to a field the form never showed).

**Printing**
- **Printing a lesson from Day view prints that lesson,** not the last one opened in the lesson form.
- **Printing works when pop-ups are blocked:** `openPrintWindow()` falls back to a hidden-iframe print at
  all 15 print sites.
- Removed "Plany" branding from the single-lesson, sub-packet and emergency-sub-plan printouts; lesson
  print text is escaped.
- Sub-plan fields containing a double quote are no longer cut off.

**Protecting your work**
- **Unsaved-change guard:** after typing in a modal, Esc, clicking the backdrop or the × asks before
  discarding. Esc closes only the top modal (it used to close the lesson form underneath a picker too).
- **Switching school year** loads the new year before committing to it; on failure you stay in the old year
  and the spinner goes away.
- Removed seats stay removed; seating and the communications log reload for the new school year.
- Scan re-import of an existing class keeps its curriculum, starting week, colour, subject and room.
- The "All classes" attendance printout merges every class's marks for a date.
- Gradebook averages use every assignment, not just the 25 newest columns.
- Copy Lesson keeps the lesson's session. The Help footer shows the real version.

## What's New in v6.1.0 - Locked-Down AI Keys, Password Reset 🔐

Phase 1 of the v6.0.1 audit.

**AI keys and the AI proxy**
- **Your AI key is no longer handed to people you share it with.** It now lives in `aiKeys/{uid}`, which only
  you can read. When a colleague uses your shared key, the `aiProxy` Cloud Function looks it up server-side
  after checking the grant. Existing keys move there automatically the next time the owner opens Plany; until
  then a colleague can't read the old copy.
- **Shared keys need a verified email.** Grants are made by email, so the proxy checks the colleague really
  owns it (Google sign-ins count as verified). New accounts get a verification email, and the AI settings show a
  *Send verification email* button when it's needed.
- **The proxy only serves signed-in Plany users** (Firebase ID token), with a 10-instance cap, a 300 s timeout
  and a 16k output-token ceiling. It is no longer an open relay.
- **The Android/iOS apps now use the proxy** (absolute URL + `https://localhost` origin), so AI works on
  filtered school networks there too.
- A 5xx from the proxy no longer resends the whole prompt straight to the provider.
- Quiz, Differentiation, Curriculum, Scan, Newsletter and the other AI tools now accept a shared key (they
  used to demand your own).
- The retired `cleverToken` function and its rewrite are gone.

**Tighter data access**
- Nobody can list or harvest the `users` collection any more; single-profile lookups still work.
- A linked principal can read only what the teacher preview shows: the school-year setting and each year's
  classes, lessons, events and breaks. Students, grades, attendance, friends and tokens are off limits.
- Storage files can only be read by their owner through the SDK (the app opens files by download URL, which
  is unaffected). HTML, script and SVG uploads are refused.

**Libraries and headers**
- PDF.js runs with `isEvalSupported: false` (blocks CVE-2024-4367 from a crafted PDF).
- SheetJS 0.18.5 → 0.20.3 from the official SheetJS CDN (fixes CVE-2023-30533).
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`,
  `Permissions-Policy`.

**Sign-in**
- **Forgot password?** link on the login screen.
- Plain-language sign-in errors instead of "Firebase: Error (auth/invalid-credential)".

**Deploy (functions changed — needs `firebase-admin`):**
```
cd functions && npm install && cd ..
firebase deploy --only firestore:rules,storage --project plany-waugs
firebase deploy --only functions --project plany-waugs     (answer Y to delete cleverToken)
firebase deploy --only hosting --project plany-waugs
```

## What's New in v6.0.2 - Security & Data-Safety Fixes 🔒

From the v6.0.1 full audit (see the Plany project doc `claude/full-audit-v6.0.1.md`).

**Security**
- **Sign in with Microsoft is turned off.** The old flow built the Firebase password from the Microsoft user
  id, which every signed-in user could read. Only the Teams import (for an already signed-in teacher) still
  runs. The OAuth `state` is now checked, and `msUserId`/`msConnected` are scrubbed from your profile on login.
- **Other people's names and messages can no longer run as code.** Everything that arrives from another
  account (friend requests, shared lessons and messages, shared resources, principal link requests and
  comments, friend and teacher cards) is escaped. `escHtml` now escapes `'`, and inline `onclick` arguments use
  a new `jsArg()` helper. Profile pictures only load from https or inline images.
- **Firestore rules:** names sent to another user must be plain text (≤120 chars, no `<>`), sender and
  recipient can't be rewritten after creation, and principal comments need an accepted link.
- **Signing out clears AI keys and Microsoft/Moodle tokens from the device.** Your AI key comes back from the
  account backup when you sign in again.

**Data safety**
- **Backup restore works.** Import wrote to the old pre-year paths, so data disappeared after a reload. It
  now writes to the current school year, re-links lessons to their classes, and never switches the active
  year.
- **Editing an assignment no longer erases its scores.**
- **Emergency Sub Plan printout** fills in teacher name, room, contacts, routines and the rest (they were
  saved under different key names than the printout read).
- **No more surprise reloads after a deploy.** The new version waits for you to click *Update Now* instead of
  reloading every open tab (and the first visit no longer loads twice). POST requests bypass the service worker.
- **Ctrl+Z in a text box undoes your typing** instead of reverting a lesson change in the database. Undo
  history is cleared on account/year switch.

**Calendar**
- **"Breakfast" no longer cancels school.** No-school title matching uses whole words, ignores titles that
  name a school activity (assembly, breakfast, program, night…), and never applies to first/last day,
  assembly, field-trip or testing events.

## What's New in v6.0.1 - AI key fix 🔑

- **AI key could break on other devices.** The key field is a password field, so Edge/Chrome autofilled the
  Plany login password into it. One Save click stored that as the "key" and backed it up to the account.
  Save now refuses anything that isn't shaped like a real provider key, and junk is never backed up.
- The key field opts out of password-manager autofill, and any autofill that still lands is reverted.
- A device holding a junk key now repairs itself from the account backup on sign-in.
- The key status icon refreshes after a key is restored (it showed 🔴 even when a key was loaded).

## What's New in v6.0.0 - The Design System 🎨

A full UI audit found the cause behind the symptoms v5.20.0 patched: there was no design system,
there were 607 individual styling decisions. 57 distinct font sizes, 26 spacing values, 18 hardcoded
radii, 14 token names covering 6 colours. This release encodes the system.

**Accessibility**
- `--text-muted` was #7F8CAA &mdash; **3.63:1** on #1F3460, failing body text. Now #9AA7C8, 5.08 everywhere.
- Purple as text is **2.66:1** and failed on every surface in the palette. New `--text-accent`
  (#BE8CEC, 4.74) replaces it in all 9 places purple was used as a foreground colour. Purple stays
  exactly as it was for backgrounds, borders and gradients.
- `--error-color` #E74C3C failed on 3 of 4 surfaces &rarr; #FF8A80 (5.35). `--success-color` &rarr; #5FE39B.
  `--warning-color` &rarr; #FFC04D. New `--info-color` &mdash; there was no info token at all.
- **127 font-size declarations rendered under 12px**, the worst at 5.6px, and they clustered inside
  the phone and iPad breakpoints. Sixteen distinct sub-12px values now collapse to two: 11px for
  numeric chips, 12px for anything you actually read. Nothing renders under 11px.
- **Touch targets.** The calendar/week/day arrows were 40px below 768px and 44px above &mdash; correct
  only where tapping doesn't happen. 44px is now the floor at every breakpoint, and on any coarse
  pointer even the compact buttons meet it.
- **One focus colour.** Pink, purple and cyan all meant "focused". Cyan wins (6.90 minimum across
  all four surfaces) and is now the single focus ring on every control.

**Structural fixes**
- `.btn-success` was used in the markup and **never defined in CSS** &mdash; the "+ Lesson" button had
  been rendering as a plain small button. It exists now.
- `.form-control` is on **145 elements and had no base rule**; it only looked styled where it sat
  inside a `.form-group`. The ~26 that don't were raw browser controls patched one at a time. There
  is now a real rule for the class.
- `.btn-danger` was defined **three times** and `.modal-large` twice; the dead blocks are gone.
- **All 25 inline `!important` declarations removed from the markup.** They duplicated a media block
  that already used `!important`, which duplicated the base rule &mdash; three layers for one outcome,
  guarding against a conflict that doesn't exist in the stylesheet. The nav bars are now one honest
  flex rule, and the week/day nav buttons finally have a real sizing rule instead of borrowing one
  from inline styles.
- Small-button radii unified to the token (5px/6px were floating free); `.btn-ghost` border 1px &rarr; 2px
  to match every other bordered button; one pill radius instead of both 999px and 99px.

**New token layer** &mdash; type scale (8 steps), spacing (4px grid), radius (6 steps), control heights,
semantic borders, scrim, focus ring, disabled opacity. Added alongside the existing tokens, so
nothing already written changes meaning. The rule going forward: if a value isn't on these scales,
it doesn't go in.

## What's New in v5.24.0 - AI Works On School Networks 🏫

**The real reason AI only worked on one computer.** The key was reaching every device fine --
TUSD filters `api.anthropic.com` at the network edge, so on a school machine the request never
left the building and every AI feature failed with a bare "Failed to fetch".

AI calls now go to **`/api/ai` on plany.work** instead of straight to the provider. A Hosting
rewrite forwards that to a new `aiProxy` Cloud Function, which makes the outbound call from
Google's network. The browser only ever talks to plany.work -- an origin the district already
allows -- so there is nothing left for the filter to block.

- Streaming is passed through as SSE, so the newsletter generator still paints text live
- Works for all three providers (Anthropic, OpenAI, Gemini); keys stay the caller's own and are
  never stored or logged server-side
- The proxy only accepts requests from Plany's own origins, so it can't be used as an open relay
- **Automatic fallback:** if `/api/ai` isn't reachable, the client calls the provider directly
  exactly as before, so a failed or missing function deploy degrades instead of breaking AI

**Also fixed: `firebase.json` had no function rewrites at all.** The only rewrite was the
catch-all `**` -> `/index.html`, which swallowed `/api/clever-token` and served it HTML. The
`cleverToken` function has been unreachable at the URL the client calls it on. Both `/api/ai`
and `/api/clever-token` are now routed ahead of the catch-all, and a `functions` block was added
so `firebase deploy` picks the functions up at all.

## What's New in v5.23.0 - AI Works On Every Device 🔑

**AI features no longer only work on the one computer where you typed your key.**

Your API key lives in `localStorage`, which is per-browser and per-device. There was already a
cloud backup (`apiKeyShares/{uid}`) and a `restoreAiKeyFromCloud()` that pulls it down on a device
with no key saved -- but the backup was only ever written by an explicit **Save Key** click. Any
account whose key was saved before that write existed had no cloud copy at all, so the restore had
nothing to restore and every other device stayed locked out of AI.

- New `ensureAiKeyCloudBackup()` runs on login: if this device has a key and the cloud copy is
  missing or out of date, it writes it. Whichever device still holds the key repairs the backup
  for all the others, and a key rotated locally keeps the backup in step.
- Key restore and incoming-share lookup are now awaited before AI feature gating runs, so a fresh
  device unlocks the AI controls on first paint instead of flashing them locked.

**To pick it up:** open Plany once on the computer where AI already works. That login writes the
backup. Every other device gets the key automatically on its next login.

## What's New in v5.22.2 - Newsletter Byline Removed ✉️

The "From Mr. Waugaman" line under the newsletter and Year-at-a-Glance headers is gone. The
`.meta` line is now skipped entirely when there's no subtitle, so no empty spacer is left behind.

## What's New in v5.22.1 - Weekend "Today" Fix + Tighter Print Margins 📅🖨️

**"Today" no longer jumps to a week that already ended.**
`getWeekStart()` was using the ISO rule, which treats Sunday as the *tail* of the previous
week. On a Sunday, clicking **Today** in Week view anchored to the Monday six days back, so
you landed on the Mon-Fri week that had already finished - with weekends hidden, today's
column wasn't in the grid at all. Sunday is now the **first** day of its week, matching the
Sunday-first month grid and the Sun-Sat week columns, so Today always lands on the week you
are actually about to teach.

- Week nav label now matches the columns actually rendered (7d mode was labeled Mon-Sat while
  showing Sun-Sat).
- Week -> Day view sync now tests the displayed date range instead of a blind Mon-Sun span.
- All three **Today** buttons (month, week, day) and the `T` shortcut now sync the month, week
  and day anchors together, so switching views right after Today can't land on a stale date.

**Printing: side margins tightened across every print view.**
The shared print shell's left/right padding was stacking on top of per-document `body` margins
and narrow `max-width` columns - some outputs were burning nearly an inch a side. Side margins
are now a uniform **0.3in** on every print view, doubled-up body margins are gone, and the
fixed 680px/720px content columns have been removed so text uses the full page width.

**Plany branding removed from printed output.** The "Generated with Plany · plany.work" footers
(newsletter, anchor charts, unit map), the "Plany · plany.work" badge on the weekly class
schedule header, and "Generated by Plany" in the newsletter subtitles are all gone. Date stamps
stay; what goes home to families no longer carries the app's name.

## What's New in v5.22.0 - Paste a Roster, Any Format 📋

### Import students from plain text
The roster importer took CSV and Excel only. Real SIS exports are usually **tab-delimited .TXT** (Synergy's Student List export is tab-delimited with a UTF-8 BOM and CRLF line endings), and half the time a roster arrives as a plain list of names in an email. Both now work:

- **Paste box** in the import dialog alongside the file picker - paste straight from the export, a spreadsheet, or an email.
- **File picker now accepts** `.txt`, `.tsv`, `.tab` and `.text` as well as `.csv`, `.xls` and `.xlsx`.
- **The delimiter is detected from the data**, not assumed: tab, comma (quote-aware), semicolon or pipe, whichever splits the rows most consistently.
- **The header row is detected, not assumed.** A headerless paste still imports; a one-column list with a "Student Name" header no longer imports the header as a student.
- **Name parsing** handles `Last, First M.` and `First Last`, drops trailing middle initials, keeps two-word surnames intact ("Moreno Romo"), and strips list markers from numbered or bulleted lists.
- **A combined "Student Name" column** can be mapped on its own - it is split into first and last on import.
- **Preview table** shows the first eight students exactly as they will be created, updating live as you change a column mapping, so a bad guess is obvious before anything is written.
- **Column detection runs offline first.** The built-in header matcher knows the names real exports use (Perm ID, Student Number, Student Name, Grade Level...); the AI call now only happens when that fails, and can no longer overwrite a good match with a null.
- **Duplicate check** now also matches on student ID, not just first + last name.

Only names, student ID and grade are imported. Date of birth, gender and language columns present in an SIS export are deliberately ignored.

## What's New in v5.21.1 - Deploys Actually Take Effect 🔁

### Fixed: a redeploy could serve stale files for an hour
The v5.21.0 "Sub Day" legend entry shipped but did not appear in the browser, while a cache-busting fetch of the
same file from the server returned it. Cause: **Firebase Hosting was serving `/` with `Cache-Control: max-age=3600`.**
The `headers` rule in `firebase.json` targeted `index.html`, and Hosting matches header rules against the
*requested path* - a visit to `plany.work/` requests `/`, which matched no rule and fell back to the one-hour default.
The service worker's network-first fetch then hit that browser-cached copy and served the old page.

Two fixes, either of which would have been enough:
- `firebase.json` now sets `no-cache` on `/` and on `**/*.html` as well as `index.html`.
- The service worker fetches app-shell files with `cache: 'no-cache'`, so it always revalidates with the server
  regardless of what headers Hosting sends.

**Note for future releases:** the SW cache name is the app version, so redeploying *without* bumping the version
reuses the same cache. Bump the version on every deploy (as the workflow already says) and this stays clean.

## What's New in v5.21.0 - Sub Days Show Up Everywhere, Checklist Stays Dismissed 🙋

### Sub day indicators in Week and Year view
A day marked as a sub day was only visible in the month calendar (the 🙋 badge) and in the Day view banner.
- **Week view** now shows a tappable **🙋 Sub Day** flag under that day's header, and outlines the whole column. Clicking the flag opens the packet.
- **Year view** rings the day in the mini-month with an orange outline and dot, so sub days are visible at a glance across the whole year, and **Sub Day** is now an entry in the year legend.

### Performance: trimmed the backdrop blurs
`backdrop-filter` makes the compositor snapshot and blur everything behind an element whenever that region changes. Four of the five uses were behind a background that is opaque or nearly so, where the blur could not actually be seen but was still paid for:

| Element | Was | Why it went |
|---|---|---|
| `.auth-form` | `blur(10px)` | sits behind an opaque gradient card — invisible |
| `.bottom-nav` | `blur(20px)` | 95–100% opaque bar — invisible |
| `.modal` | `blur(4px)` | full-viewport blur behind a 70% black scrim; the expensive one with 10k+ elements on screen |
| `.help-overlay` | `blur(2px)` | full viewport, barely visible at 2px |

Those are gone; the two overlay scrims were deepened (70% → 78%, 55% → 72%) so the separation reads the same. **`.app-header` keeps its blur** — its background fades to transparent, so there the blur *is* the effect.

### Fixed: the Year Setup checklist coming back after being dismissed
The dismissal was stored only in a **per-school-year localStorage key**, so it returned whenever the school year rolled over, on a second device, in the installed app vs the browser, and any time site data was cleared. It is now an **account-level flag saved with your settings** (with localStorage kept as a fast mirror and the old per-year key still honored), so once dismissed it stays dismissed. The nav dot is still the way to bring it back on purpose.

## What's New in v5.20.0 - UI Audit: Day View Accordion, Desktop Layout, Contrast Fixes 🖥️

### Day view
- **Click a class to expand it.** Each class row now opens in place to show the whole lesson - standards & objectives, learning target, success criteria, lesson flow, materials, activities/notes and attachment names - with **Edit lesson** and **Print this lesson** buttons inside the panel. Classes with no lesson still open the add-lesson form on click.
- **Print prints the day *and* every lesson.** The Day view printer button now builds a full printable day (events, every class with its complete lesson plan, sub-day flag) as an HTML print instead of the old title-only jsPDF summary.
- **"Create Sub Day".** The Day view's Sub Day button is now labeled **Create Sub Day** and marks the date as a sub day as soon as the packet is saved - the "Mark as Sub Day" toggle no longer has to be remembered. Generated student work saves to that date as before, the Day view refreshes on save, and a **This is a Sub Day** banner with an *Open packet* shortcut appears at the top of the day.

### Fixed: invisible controls and unreadable text
- **Curriculum subject chips were invisible until hovered.** The stylesheet used eight CSS variables that were never defined (`--primary-color`, `--text-color`, `--surface-color`, `--surface-muted`, `--neon-purple`, `--hot-pink`, `--electric-yellow`, `--bg-secondary`), so each one silently fell back to a *light theme* value - the subject chips rendered `#333` text on a dark card (1.5:1 contrast) and only appeared on hover. All aliases are now defined against the real 80s palette. The same bug was making the Sub Day packet's section cards render on white (`--surface-color` -> `#fff`).
- **Class colors now pick their own label color.** White text on a yellow or teal class scored as low as 1.2:1. A luminance check (`textOnColor()`) now switches labels to near-black on light class colors - calendar chips and class card headers.
- Danger buttons, the curriculum "delete selected" action and the active Students tab were all under the 4.5:1 minimum; all three were re-toned.

### Desktop
- **Lesson editor is a real desktop editor.** At 1200px and up the lesson modal widens to 1180px and splits into two columns, the header stays pinned, and **Save/Cancel stick to the bottom** instead of sitting two screens down. Textareas are taller. Below 1200px the form is exactly as it was.
- **Day view rows use the width.** The lesson title now sits beside the class name instead of hugging the far right edge, and the expanded lesson detail lays out in two columns.
- **Less wasted chrome.** The mobile tab bar shrinks on desktop (it was eating 182px of vertical space), settings/AI cards widen from 800px to 1120px (1360px past 1500px), the Classes grid goes to four columns on wide screens, and week-view day headers stay pinned while the columns scroll.

## What's New in v5.19.8 - No More Browser Header/Footer on Prints 🖨️

### The page title, URL, date and "Page 1 of 3" no longer print
Every Plany print view (weekly schedule, lesson plans, sub plans, sub day and student work packets, emergency sub plans, newsletters, anchor charts, grade reports, attendance, seating charts, quizzes/rubrics, unit map, principal preview) opens in a new browser window, and the browser was stamping its own header and footer into the page margins - the document title and date across the top, `about:blank` and the page number across the bottom.

Prints now go through a shared `preparePrintDoc()` shell that sets `@page { margin: 0 }`, which is the only reliable way to suppress those browser-drawn headers and footers. Real margins are preserved on **every** page (not just the first) by wrapping the printed document in a table whose repeating header/footer rows act as top and bottom spacers, with the left/right margin carried by the body cell. Forced page breaks inside packets still work, and landscape prints stay landscape.

Worksheet-image printing already used a zero page margin and is unchanged.

## What's New in v5.19.7 - Principal View Loads the Right Year 🗓️🔧

### Fixed: a linked principal saw no / stale lessons
The principal Staff view was loading the **wrong school year** for the teacher it opened, so the teacher's current lessons appeared missing (only whatever happened to line up with the principal's own default year showed). Two root causes:

- **Phantom year documents.** Each `years/{year}` record only held subcollections (lessons, classes) and no fields, so Firestore's collection query returned *nothing* — the principal's year dropdown came up empty and the view fell back to the principal's own school year. Plany now writes a field to the year document when a teacher opens it, so years are discoverable.
- **Wrong fallback.** When the dropdown was empty the view used the *principal's* school year. It now reads the **teacher's own** current school year (authoritative) and defaults to it, and lists the teacher's other years when available.

Net effect: opening a teacher now shows their real, current plans across all classes. (Existing teachers' year records are picked up automatically the next time they open the app.)

## What's New in v5.19.6 - Clearer Unlink Button 🔗

### "✕" is now a labeled "Unlink Teacher" button
On each linked-teacher card in the principal Staff view, the small "✕" button is now a clear **🔗 Unlink Teacher** button. It works exactly as before (with the same confirmation prompt) — just easier to understand.

## What's New in v5.19.5 - Principals Can Open a Lesson 📄👁

### Click a lesson in the Day tab to see its full plan
In principal view, the Day tab is now interactive: clicking any class that has a planned lesson opens a **read-only lesson viewer** showing the full plan — standards & objectives, learning target, success criteria, lesson flow, materials, and activities/notes (plus attachment names). Activity-type classes show their Instructions instead. Slots with no lesson stay inert. A **💬 Leave Feedback** button in the viewer jumps straight to leaving an observation comment on that specific lesson. The rest of the principal view stays fully read-only.

## What's New in v5.19.4 - Principal Day Tab Landing Fix 📄

### The Day tab no longer opens on an empty "No School" day
In principal view, opening a teacher landed every tab on **today**. During summer (or when viewing a past/next school year), today is outside the school year, so the Day tab showed only a "No School – all classes cancelled" banner and looked broken, even though the teacher had plans during the year. Now the landing date is smart: **today** if today falls inside the selected school year, otherwise the teacher's **first planned lesson**, or failing that the start of that school year. The Prev / Today / Next buttons and date picker still work exactly as before — this only changes where it first opens.

## What's New in v5.19.3 - Startup Hotfix 🐞

### Fixed a v5.19.2 crash on load
v5.19.2 moved the Microsoft/Moodle state restore into the page-load OAuth callback, which ran *before* those variables were declared — a JavaScript Temporal-Dead-Zone error that aborted the rest of app startup (symptoms in the console: `Cannot access 'moodleUrl' before initialization` and `Cannot access 'emergencySubPlans' before initialization`). The load-time callback now only handles the Microsoft redirect; MS/Moodle state is restored from a separate `restoreConnectionState()` that runs after startup completes. All of the v5.19.2 account-isolation and principal-navigation work below is unchanged and now loads correctly.

## What's New in v5.19.2 - Full Account Isolation + Principal Navigation 🔒🧭

### Accounts are now fully separated on this device
v5.19.1 reset the in-memory profile/settings, but two leak paths remained when signing out and into a different account on the **same device**:

- **Other in-memory data** (lessons, classes, students, assignments, attendance, communications, units, sub days, emergency sub plans, grade settings, friends, principal links) is now all wiped on every auth change via `resetUserState()`, so a fresh account can never briefly show the previous account's content.
- **Device-local storage** (`localStorage`) is shared by every account on a device, so AI settings (teacher name, packet grade, API keys), Microsoft/Moodle tokens, and the cached school year used to carry over. Plany now detects when a **different** account signs in (by comparing the last signed-in UID) and purges that account-scoped storage first via `clearAccountStorage()`. Signing back into the **same** account keeps your own local state.
- Fixed a loader bug where **grade settings** (`classGradeSettings`) were not reset when the new account had none, so they could persist from the previous account.

> AI API keys are re-synced from each account's own cloud record on login, so the correct key is restored automatically for the account that owns it.

### Principals can now move through a teacher's plans
The read-only teacher view added **date navigation** to the Month, Week, and Day tabs: **◀ Prev**, **Today**, **Next ▶**, a period label, and a **date picker** to jump straight to any date. Opening a teacher lands on **today**. The plans themselves stay read-only — only the navigation is interactive.

## What's New in v5.19.1 - Clever Removed + Account Isolation Fix 🧹🔒

### Removed the Clever integration everywhere
Clever never worked for Plany (it requires a registered Clever developer app plus district-admin approval — impractical for a solo teacher app), so all of its dead code has been removed: the login/register buttons, the roster-import button and modal, the Settings "Clever" card, all client-side Clever SSO/roster code, the `.btn-clever` styles, the `/api/clever-token` Hosting rewrite, and the `cleverToken` Cloud Function source. Roster import still works via **🏫 SIS / CSV** and **🎓 Google Classroom**.

- Fixed a latent bug where the **Register** screen was showing a live "Log in with Clever" button (a mis-placed HTML comment left it un-commented) that hit the dead endpoint.
- The shared OAuth callback handler was preserved and renamed to `initOAuthCallback`, so **Microsoft** and **Moodle** connection state still restore correctly.

### Fixed: new accounts inherited the previous account's profile
Signing into a different account — or creating a new one — could still display the **previous user's profile** (name, role, school, etc.). The profile lived only in in-memory globals that were never reset when the account changed, so a fresh account with no saved profile kept showing the old one. Plany now resets all in-memory, account-specific state on every sign-in and sign-out, so each account starts clean.

### Deploy note
- The old `cleverToken` Cloud Function is still deployed but is now orphaned and unused. To remove it, run `firebase functions:delete cleverToken` — this does **not** touch `generateLesson`. A normal `firebase deploy --only hosting` is unaffected.

## Previous Releases

## What's New in v5.19.0 - Clever Auth-Code Login (backend) 🔵🔧

### Clever now uses the authorization-code grant (with a Cloud Function)
Clever removed support for the implicit grant (`response_type=token`), which is why sign-in was returning a **400 Bad Request**. Plany now uses Clever's **authorization-code grant**, completed by a small backend so the client secret never touches the browser.

- **New Cloud Function** `cleverToken` (`functions/index.js`) exchanges the Clever `?code=…` for an access token server-side via HTTP Basic auth, and returns only the token to the app.
- **New Hosting rewrite** `POST /api/clever-token` → the function (same-origin, no CORS headaches).
- `loginWithClever` now requests `response_type=code`; `initCleverCallback` detects the `?code=…` return and calls the function; everything downstream (roster import, Firebase sign-in) is unchanged.
- Credentials are read from `functions/.env` (`CLEVER_CLIENT_ID`, `CLEVER_CLIENT_SECRET`) — see `functions/.env.example`. The `.env` file is git-ignored and never committed.

### Deploy notes (first-time backend setup)
1. Requires the Firebase **Blaze** plan (Cloud Functions won't deploy on Spark). Usage at Plany's volume is effectively free.
2. `cp functions/.env.example functions/.env` and fill in your Clever Client ID + **Client Secret** (apps.clever.com → your app → OAuth settings).
3. Confirm `https://plany.work/` is a registered redirect URI on the Clever app.
4. `cd functions && npm install` then deploy: `firebase deploy --only functions,hosting --project plany-waugs`

## What's New in v5.18.2 - Clever Login Fix (cont.) 🔵

### Dropped unsupported `scope` parameter
- Clever's authorize endpoint does **not** accept a `scope=` query parameter (scopes are set in the Clever app dashboard). Sending it can cause a **400 Bad Request**, so it is now omitted from the login request.
- This is a diagnostic step: if Clever still returns a 400 after this, the account requires the authorization-code grant with a server-side token exchange (a Firebase Cloud Function), since Clever no longer supports the implicit/token flow.

## What's New in v5.18.1 - Clever Login Fix 🔵

### Fixed Clever Sign-In 400 Error
- Fixed a **400 Bad Request** when connecting to Clever caused by a malformed `client_id`
- If a full Clever URL was accidentally saved as the Client ID, Plany now extracts and stores only the real Client ID (self-heals localStorage and Firestore)
- Added validation so only a valid Client ID (a ~20-character code) can be saved — pasting a URL is now rejected with a clear message
- `loginWithClever` guards against sending an invalid value to Clever's authorize endpoint

> Note: Clever now recommends the authorization-code grant (with a server-side token exchange). Plany's current client-side implicit flow requires that flow to be enabled on your Clever app. See the release notes below for the longer-term backend option.

## What's New in v5.18.0 - In-App Help & Guide 📖

### Slide-In Help Panel
- New **?** button in the header opens a slide-in Help & Guide drawer from the right
- **14 step-by-step topics** covering the whole app: Getting Started, School Year setup, Classes, Lessons, Calendar Views, No-School Days & Events, Sub Days & Packets, Students/Grades/Attendance, turning on AI, AI Lesson Fill, Curriculum Library, more AI Tools, and Keyboard Shortcuts
- **Real in-app screenshots** for every major area, annotated with captions
- **Live search** filters topics as you type and highlights matches
- **Quick-nav chips** jump straight to any topic; each topic is a tappable accordion
- Works offline once viewed (screenshots cached by the service worker)
- Numbered steps, tip/warning callouts, and a link to the keyboard-shortcuts list
- Fully responsive — full-screen drawer on mobile, 560px panel on desktop; closes with the ✕, the overlay, or `Esc`

## What's New in v4.2.0 - Phase 2: Lesson Management 📝

### Drag & Drop Lessons 🖱️
- **Drag lessons** between days on the calendar
- **Hold Shift + Drag** to copy instead of move
- Visual feedback with drag indicator
- Touch support for mobile (long-press to drag)
- Undo support for moved lessons

### Recurring Lessons 🔄
- Create weekly or bi-weekly recurring lessons
- Choose duration: 4, 6, 8, 10, 12 weeks, semester, or year
- Each instance can be customized individually
- Recurring badge shown on calendar

### Lesson Linking (Multi-Day Lessons) 🔗
- Link lessons together as a series (e.g., "Part 1 of 3")
- Create new series or add to existing
- Navigate between linked lessons easily
- Link indicator (🔗) shown on calendar

### Duplicate Detection ⚠️
- Warning when creating lesson for same class/date
- "View" button to see existing lesson
- Prevents accidental duplicates

## Previous Releases

### v4.1.0 - Phase 1: Core Infrastructure

### Keyboard Shortcuts ⌨️
- **Navigation**: Arrow keys (←/→) for prev/next month/week, `T` for today
- **Views**: Number keys 1-6 switch between Year, Month, Week, Classes, Friends, Settings
- **Actions**: `N` = New Lesson, `E` = New Event, `C` = New Class
- **Search**: `Ctrl/Cmd + K` opens search
- **Undo/Redo**: `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Y` redo
- **Help**: `?` shows keyboard shortcuts modal
- **Close**: `Esc` closes any modal

### Global Search 🔍
- Search bar in header (click or press Ctrl+K)
- Search across lessons, events, and classes
- Filter by type (checkboxes)
- Filter by date range
- Click results to jump directly to item
- Highlighted search matches

### Undo/Redo System ↩️
- Undo deleted lessons with `Ctrl+Z` or click "Undo" in toast
- Toast notification appears after delete with undo option
- Undo stack holds last 50 actions
- Redo support with `Ctrl+Y`

### Data Export/Backup 💾
- Export all data as JSON file
- Choose what to export: Lessons, Classes, Events, Settings, Curriculum
- Import from backup file
- Duplicate detection during import
- Found in Settings → Data & Backup

### Offline Indicator 📡
- Shows banner when you go offline
- Displays last synced time
- Auto-hides when back online

## Previous Releases

### v4.0.0 - User Profiles & Friends

### User Profile System
- **Profile Picture**: Upload and display your profile photo
- **Display Name**: Set your preferred name
- **Role**: Teacher, Lead Teacher, Coach, Specialist, Substitute, Student Teacher, Administrator
- **Grade Level**: Pre-K through 12th Grade, or Multiple Grades
- **School**: Your school name
- **District**: Your district name
- All profile data syncs to Firebase and is visible to friends

### Enhanced Friends System
- **Full-Width Card**: Friends section now matches Smart Import layout
- **Sort Tabs**: Filter friends by All, School, Grade, Role, or District
- **Friend Cards**: Show profile pictures and badges for grade/role/school/district
- **Grouped View**: When sorting, friends are grouped with headers and counts
- **Rich Profiles**: See colleague details at a glance

### UI Improvements
- **Curriculum Library**: Now full-width large card like Smart Import
- **User Profile Card**: Full-width with profile picture, all fields organized
- **Profile Picture Display**: Circular avatar with purple glow border

### Previous Updates (v3.8.x)

### Bug Fixes
- **Mobile Month View**: Shows only weekdays (Mon-Fri) on small screens for better readability
- **District PDF Import**: Fixed event parsing and added better error handling with debug logging
- **Curriculum Library**: Enhanced delete button visibility with proper styling

### Technical Improvements
- **Network-First Caching**: App files (HTML, CSS, JS) now always fetch fresh from server first
- **Auto-Update Detection**: App checks for updates every 5 minutes and prompts user when available
- **Update Banner**: Shows notification when new version is available with "Update Now" button
- **Force Refresh Function**: Added `forceRefresh()` function callable from console to clear all caches
- **Service Worker v3.8.11**: Improved cache management and immediate activation of updates
- Removed duplicate onclick handler that was causing PDF import issues
- Added PDF.js worker initialization retry logic
- Mobile calendar now displays 5 columns (weekdays) with weekend headers hidden

## Features

- 📅 **Calendar View** - Monthly calendar with lesson previews
- 📋 **Week View** - 5-day week layout
- 🎓 **Classes** - Create and manage classes with schedules
- ✏️ **Lessons** - Full lesson planning with objectives, materials, activities
- ⚙️ **Settings** - School year configuration, breaks & holidays
- 🔐 **Authentication** - Google Sign-In + Email/Password
- 📱 **PWA** - Installable, works offline

## Firebase Setup

### 1. Enable Authentication Providers

Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → Authentication → Sign-in method

Enable these providers:
- ✅ **Google** - Click "Enable", add your project's support email
- ✅ **Email/Password** - Click "Enable"

### 2. Deploy to Firebase

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy everything (hosting + firestore rules)
firebase deploy
```

Or deploy separately:
```bash
# Deploy only hosting
firebase deploy --only hosting

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

### 3. Add Authorized Domains (if needed)

If you're using a custom domain:
1. Go to Firebase Console → Authentication → Settings
2. Add your domain to "Authorized domains"

## Project Structure

```
plany/
├── public/                 # Hosted files
│   ├── index.html         # Main app
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service worker
│   ├── css/
│   │   └── styles.css     # 80's themed styles
│   ├── js/
│   │   ├── firebase-config.js
│   │   └── app.js         # Main application
│   └── icons/             # PWA icons
├── firebase.json          # Firebase hosting config
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Firestore indexes
└── .firebaserc            # Firebase project config
```

## Color Palette

- Neon Pink: `#FF6B9D`
- Electric Purple: `#9D4EDD`
- Cyan Blue: `#00D4FF`
- Sunset Orange: `#FF8C42`
- Sunset Yellow: `#FFD93D`
- Miami Teal: `#6FFFE9`

## License

MIT
