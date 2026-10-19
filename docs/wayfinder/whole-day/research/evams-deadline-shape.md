# What deadline data can evams hand to RPM?

Ticket: `tickets/03-evams-deadline-shape.md`. Source: `C:\Repos\isdm\evams` (read only; nothing edited there).
Labels: **measured** = I read the code/doc or fetched the live feed on 2026-10-18. **inferred** = my reasoning from what I read.

## 1. Data that exists

### Assessments (the useful part)

Public feed shape, `SiteAssignment` in `app/site-data.ts:41-58` (measured). Live example fetched from `https://evams.evamuse.chatgpt.site/api/site-data` (measured): 41 assignments, 9 active and dated today or later.

| Field | Meaning | Example |
|---|---|---|
| `id` | card id; for LMS tasks `lms-<lmsContentId>` | `lms-1329513` |
| `lmsContentId` | raw LMS content id (digits), or `unlinked-<hash>` for a test the LMS no longer lists | `1329513` |
| `title` | raw LMS title | `B10_T2_CBCL_District Presentation` |
| `course` | course name from the LMS inventory, or group code (CBCL, PMDL, WID) | `CBCL` |
| `dueDate` | `YYYY-MM-DD` | `2026-11-12` |
| `time` | free text, 12-hour clock | `11:00 PM`; also `Not specified by LMS`, `time to be confirmed`, ranges like `11:30 AM-1:00 PM` |
| `submissionWindow.closesOn` / `.time` | LMS End Date (else due date); the real closing moment | `2026-11-12` / `11:00 PM` |
| `status` | `active`, `tentative`, `postponed`, `cancelled`, `details-pending` | 8 of 41 are not active |
| `lmsDateChange {previous, noticedAt}` | written by code when the LMS moves the date | optional |
| `brief`, `briefStatus`, `description`, `checklist`, `briefSources` | compact brief and links | optional |
| `lastUpdated` | ISO UTC timestamp | `2026-10-14T13:40:08Z` |

- IDs are stable (measured): the pipeline matches by exact LMS content ID, renames keep one card, and the card keeps its id (`docs/HERMES-PIPELINE.md`, "LMS dates"; `AGENTS.md` rule "Match by exact LMS ID"). Caveat: a disabled test the LMS stops listing becomes `unlinked-<sha(title)>`, so its id can change if the title changes (measured, `HERMES-PIPELINE.md`).
- Time zone: never written in the data (measured). The strings are wall-clock India time. `app/ics.ts:15` hard-codes IST = UTC+5:30 (measured). Treat as Asia/Kolkata (inferred, safe).
- The effective deadline is `submissionWindow.closesOn` + its `time`, not `dueDate` (measured: `app/assessment-model.ts:74-98`, "The LMS closing date: when uploads stop"). `closesOn >= dueDate` is guaranteed by the publisher.
- Submitted or not: NOT in the public feed (measured: no `lmsStatus`/`lmsSubmitted` field; the key is added only in `assignmentFromLms`, `app/assessment-model.ts:157-158`). The personal "submitted" status exists only in the signed-in loader (`core/lms/lms-student-data.ts` `LmsAssessment.status`, `isLmsSubmitted` at `app/assessment-model.ts:60`). Policy: "Keep personal LMS status and credentials out of shared publication" (`AGENTS.md`, Boundaries).
- Signed-in `LmsAssessment` fields (measured, `core/lms/lms-student-data.ts:1-16`): `id`, `title`, `status`, `courseId`, `sectionId`, `dueDate`, `dueTime`, `taskCardDueDate`, `endDate`, `submissionUrl`, `resourceTitle`, `resourceUrl`. The date format on the LMS is `D-MON-YYYY`, converted to ISO in `isoTaskDate`.
- Rule from the owner: the LMS is the only source of assessment dates; no model may set one (`AGENTS.md`, "Assessment and evidence work"). So the feed's dates are code-derived, not guessed.

### Class schedule

- Public `weekItems` (110 items; 66 `class`, 14 `assignment`, 3 `quiz`, 27 `notice`) have a `date` plus a free-text `meta` like `9:00-11:00 AM - Session 4` and `section` A/B/all (measured). Time zone again implicit IST.
- The LMS-sourced class entries in the public feed stop at 2026-10-07 (measured: 50 items with a `lms-class:` source, latest date 2026-10-07). Later class entries are `tentative` ones read from course outlines (measured). So the public feed is NOT a live timetable (inferred).
- The live timetable comes from the signed-in LMS calendar: `LmsCalendarEvent {nid, title, start, end, subject, trainers}` (`core/lms/lms-schedule.ts:1-9`), turned into rows by `classRowsOn` (`app/week-by-date.ts`). `npm run week -- <YYYY-MM-DD>` prints one day's class rows from the session Hermes saved (measured, `package.json:38` and the `AGENTS.md` rules row). It prints to stdout only; it does not publish anything.

## 2. Where it lives and how fresh

- Collector: Hermes job "ISDM academic desk" (`cc2ea418e6e3`, script `isdm_academic_job.py`) running `automation/hermes/academic_job.py` stages: collection, LMS dates, details, briefs, LMS files (measured, `HERMES-PIPELINE.md` Stages).
- Cadence: hourly tick since 14 Oct 2026, and the work only runs when due. `runEveryHours` is 6 in the state file I read, so a full run happens about every 6 hours; a failed run retries at the next hourly tick (measured: `HERMES-CUTOVER.md` "Hourly tick"; `academic-job-state.json` shows `runEveryHours: 6`, started 2026-10-18 07:46 UTC). The most recent run found `datePublication: unchanged` (measured).
- Storage: the published snapshot is a row in table `site_snapshots` in the app's own database; the revision is the row id (measured: `db/schema.ts:11`, `HERMES-CUTOVER.md` step 1). The live revision was 180 at generatedAt 2026-10-18 07:48 UTC (measured). Local working files on the PC: `%LOCALAPPDATA%\hermes\profiles\isdm-desk\automation\` (`academic-job-state.json`, `latest-status.md`, `last-reviewed-snapshot.json`, `isdm-lms-session.json`) (measured by listing).
- Freshness for RPM: 0 to about 6 hours behind the LMS (inferred from the cadence), plus a 60 s browser and 180 s CDN cache on GET (measured, `app/api/site-data/route.ts`).
- Attendance Cloudflare Worker with D1 (`services/attendance`) holds logins and attendance marking, not deadlines (measured: `AGENTS.md` rules row; no assessment fields in its listing). Not useful for this.

## 3. Reachable from outside the PC?

- Yes. `GET https://evams.evamuse.chatgpt.site/api/site-data` returns the whole feed with HTTP 200, no auth, from Cloudflare (measured: I fetched it with plain curl). Headers `X-Site-Revision` and `X-Site-Data-State: live` (measured). POST needs a bearer token (`getSiteUpdateToken`), not needed by RPM (measured, route.ts).
- So the PC can be off and the last published snapshot is still readable (measured/inferred: data is in the site's database, not on the PC).
- The signed-in data (submitted state, live timetable) is only reachable by logging in to the LMS with cookies. That session is saved on the PC (`isdm-lms-session.json`) and the app has its own gateway at `/api/lms/*` that needs the student's own sign-in (measured, `app/api/lms/session/route.ts`). Not reachable from RPM without credentials (inferred).

## 4. `app/ics.ts`

- Builds ONE single-event `.ics` file per call, `buildIcs(event)` (measured, `app/ics.ts:69-102`). Used only by the browser "Add to calendar" button (`app/ui/assessments-view.tsx:440`). No feed route exists (measured: grep shows no other caller; `app/api` has only feedback, lms, reading-catalog, site-data, suggestions).
- UID: `evams-lms-<lmsContentId>@evams`, else `evams-assessment-<id>@evams` (`assessmentCalendarUid`, `ics.ts:39-42`). Stable across changes, so a re-import updates (measured).
- Times: if the closing clock parses, `DTSTART = close - durationMinutes` (30 min in the UI) and `DTEND = close`, converted from IST to UTC `...Z`; with no clock it is an all-day event (measured, `ics.ts:15-20, 69-102`). Title is `"<code> <title> closes"`. A `VALARM` 24 h before. `METHOD:PUBLISH`.
- Gaps for a feed (measured/inferred): it emits one `VCALENDAR` per event, so a feed needs a small wrapper that joins the `VEVENT`s; no `SEQUENCE`/`LAST-MODIFIED`; no `STATUS:CANCELLED` for cancelled cards (so a deletion would not propagate; inferred); `DTSTAMP` is "now" each call; `minutesFromClock` returns nothing for ranges and `Not specified` strings (those become all-day). The UID and IST helpers are reusable as-is; the rest is about 30 lines to add (inferred).

## 5. Smallest ways for RPM to receive deadlines

### A. RPM pulls the public JSON (recommended first)
RPM's agent (VM) or a Convex scheduled function does `GET /api/site-data` every hour or so, keeps assignments with `status = active` and a `submissionWindow.closesOn`, and upserts by key `lms-<lmsContentId>`.
- Freshness: up to about 6 h behind the LMS plus 3 min cache. Same as evams's own site.
- Effort: lowest. No change to evams (read only). One fetch and one mapping (about 40 lines). Parse `time` with the `minutesFromClock` rules (12-hour clock, IST); no clock means all-day or treat as 23:59 (RPM decision).
- PC asleep: nothing breaks for RPM; it still gets the last published snapshot. It only goes stale (inferred), and the Hermes job catches up within about an hour of wake (measured, `HERMES-CUTOVER.md`).
- IDs: `lmsContentId` is stable; updates are upserts. Deletions: a card that turns `cancelled`/`postponed`, or vanishes from the list, is the delete signal. RPM must treat "missing from the feed" with care: "Omission from one student's pending list is not evidence that a cohort assessment disappeared" (`AGENTS.md`). Use `status` for deletion and a grace period for disappearance (inferred).
- Misses: your submitted state (not public) and the live class timetable (public feed's LMS class rows end 2026-10-07).

### B. evams publishes an .ics feed that the RPM calendar subscribes to
Add a route (for example `/api/deadlines.ics`) that wraps `buildIcs` for each active assignment. Google Calendar or RPM subscribes.
- Freshness: Google refreshes subscribed feeds slowly, often 8 to 24 h (inferred from general Google behaviour, UNVERIFIED here); worse than A.
- Effort: edit evams (30 lines, new test, needs its `npm run verify`, publish through `docs/PUBLISHING.md`). Highest of the three.
- PC asleep: same as A (the route reads the site database).
- IDs: the UID is already stable. Deletions work only if the feed adds `STATUS:CANCELLED` or drops the event (calendars drop events that disappear from a subscribed feed; inferred).
- Fit with the map: the map's rule is "other calendars stay read-only calendar commitments", but a deadline is a task-like thing, not a commitment; an .ics would land as a commitment (inferred).

### C. Hermes pushes into Convex (job POSTs to an RPM HTTP route)
Add a final stage to `academic_job.py` that POSTs the active assessments to a Convex HTTP action.
- Freshness: best (push right after each publish; same 6 h collection cadence, no pull delay).
- Effort: medium. Needs a shared secret in the PC's Hermes config, an RPM HTTP route, and a Hermes edit. Hermes changes need the owner's approval steps (`AGENTS.md`: installed launchers change only through `HERMES-CUTOVER.md` steps).
- PC asleep: the push fails, and nothing arrives until the PC wakes and the job reruns. This is the one option that depends on the PC (measured: Hermes gateway stops on sleep and recovers within about 15 min of wake, `HERMES-CUTOVER.md`).
- IDs: send `lmsContentId`, so updates are exact. Deletions: the sender knows when a card went cancelled.

### Not in any option
- "Did I submit it?" needs the signed-in loader on the PC (the saved session). If RPM should auto-complete a deadline once submitted, that is a separate, PC-bound step (`npm run week`-style script or a new evams export). Treat as a later ticket.
- Live class timetable: same constraint. Today only `npm run week -- <date>` on the PC reads it.

## Recommendation (inferred)
Start with A. It needs no change to evams, works while the PC sleeps, and the IDs are stable. Move to C only if 6 h latency matters.

## Open questions for the user
1. Should a deadline with no clock time become all-day or 23:59?
2. Do you want "submitted" to clear a deadline in RPM? That forces a PC-bound step.
3. Is the class timetable in scope for RPM, or only assessments?
