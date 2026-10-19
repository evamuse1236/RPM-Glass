# Spec draft: RPM for the whole day

Status: draft, 2026-10-18. Not approved. Source map: [map.md](map.md).

This spec covers one master plan that the phone, coding agents, Google Calendar and Tasks, the LMS (evams), health routines, a notch on the phone, and an always-on agent all read and change. It is split into five streams plus one cross-cutting piece, the master copy and sync model. Each stream lists what is decided (with its source ticket), what is only proposed, what is still open, and small build pieces. Terms follow `CONTEXT.md` and `PRODUCT.md`. Items labelled PROPOSED are recommendations. They are not decisions.

"map" below means the "Settled while charting" notes in `map.md` (agreed 2026-10-18, no ticket).

## Status

| Stream | Decided | Open | Blocked on |
|---|---|---|---|
| Master copy and sync model | Convex is master; offline phone copy; latest edit wins (map) | Edit unit; offline merge; History across devices; calendar vs task list (04) | Ticket 11 |
| Agent and VM | Pi runs on the small VM; Telegram; logged, undoable Agent changes (01, 09; map) | Action set and door (05); log shape; scheduled jobs; laptop planning | Ticket 04 |
| Google sync | Calendar push, Tasks poll, echo guards, silent copy, OAuth (02) | Five live behaviours (11); recurring events | Ticket 11 |
| LMS | evams public JSON, pulled by RPM (03) | Item type; no-clock rule; "submitted"; timetable (10) | Ticket 10 |
| Notch | Look and content (map) | Android approach (06); states, symbols, motion (07) | Ticket 06 |
| Health | Routine, water, meal log rules (08) | Health Connect use; diet goal | Nothing for the decided part |

## Data the master copy must hold

Today's backend holds per-device tables only (`events`, `records`, diagnostics in `convex/schema.ts`). `convex/sync.ts` accepts three collections (`entries`, `revisions`, `projects`) in batches of 50. There is no shared plan across devices yet.

Fields below are marked **decided** (from a ticket), **fact** (from the research notes), or **guess** (mine; confirm before building).

- **Task** (guess: reuse the phone's `entries` payload): title, notes, date, optional time and estimate, Block link, Must, status, original words, `updatedAt`, `updatedBy` (phone, Google, agent), `deleted`.
- **RPM block and Result**: Block holds Result, Purpose, Plan. A Result has no deadline field; it derives from its latest open dated task (`PRODUCT.md`). Only the user marks a Result achieved (`PRODUCT.md`). Any new entity must keep this.
- **Google link record** (guess): RPM id, Google kind (event or task), Google id, calendar or list id, last etag, last `updated`, content hash, last RPM version. The research says to store etag and `updated` per write and a hash for tasks (fact, ticket 02). Event ids may be chosen by RPM (fact).
- **Agent change** (partly decided): reason and Undo are decided (map; `CONTEXT.md`). Guess for the rest: id, time, which entity, before and after, which agent session, source message, status (applied, undone), and a "verified how" field. What counts as verified is open (see Agent).
- **History entry** (guess): the losing version, its writer and time, and the Undo link.
- **Routine** (decided shape, ticket 08): name, steps, window (start and end), days. Guess: ordered step ids.
- **Routine run** (decided, ticket 08): one per scheduled day. State is done, partly done with skipped steps, or missed. Skipped steps are recorded as skipped, not failed. Missed runs do not carry over.
- **Water log** (decided, ticket 08): one record per "Drank it" (one glass, 250 ml, goal 8). Settings: 90 min, 8 AM to 10 PM.
- **Meal log** (decided, ticket 08): time, slot (guessed from time), the user's words. Editable from History.
- **Meal estimate** (decided to be separate, ticket 08): protein, calories and similar, marked as guesses, linked to a meal entry, never overwriting the user's words. Fields are a guess.
- **LMS deadline source** (partly decided, ticket 03): key `lms-<lmsContentId>`, title, course, effective deadline from `submissionWindow.closesOn` plus `time` (IST), status, `lastUpdated`, revision seen. What RPM item it becomes is open (ticket 10).

## Cross-cutting: Master copy and sync model

### Decided
- Convex is the master copy. The phone keeps an offline copy. (map; ADR candidate)
- RPM owns tasks. An RPM calendar and an RPM task list sync both ways. The latest edit wins and the other version stays in History with Undo. (map)
- Other calendars remain read-only calendar commitments. (map; `CONTEXT.md`)
- The Google copy is silent. RPM rings the reminders. (map)
- Calendar can push; Tasks must be polled; the `syncToken`, etag and hash tricks stop echo loops. (ticket 02)

### Proposed
- PROPOSED: edit unit = one item (task or Block field set), with a version counter and timestamp, not a whole-plan snapshot. Trade-off: simple and matches "latest edit wins", but two fields edited on two devices at once will overwrite one another. Field-level merge fixes this and costs more build.
- PROPOSED: the phone sends offline edits as an append log using the existing batch, event id and sequence pattern in `convex/sync.ts`, which already de-duplicates. Trade-off: cheap reuse; needs a shared, not per-device, projection.
- PROPOSED: a timed task goes to the RPM calendar as an event. A dated task with no time goes to the RPM task list. Reason: Tasks keeps the date only (ticket 02). Trade-off: a task can move between the two when the user adds or removes a time.
- PROPOSED: the agent and coding tools write through the phone's ingest path, tagged with an actor, so latest-wins and History apply to them.

### Open questions
- All of ticket 04: offline merge, what counts as one edit, History and Undo across devices, what moves from the phone store to Convex, calendar vs task list routing.
- Is Undo of a synced item global (reverses it on every device and in Google)? Owned by ticket 04. Not decided.

### Build pieces
1. Shared plan table in Convex (not per device), read-only mirror of the phone's current data. Done when: phone data appears there, and a second device pair sees the same rows. **Blocked** on ticket 04 for the edit rules; the read-only mirror itself can **start now**.
2. Actor field on every change (phone, google, agent, user-laptop). Done when: each stored change shows its actor. Can start after piece 1.
3. History entry for the losing version, with Undo. Done when: two conflicting edits in a test leave the loser restorable. **Blocked** on ticket 04.
4. ADR: Convex is master. Done when: written and linked from `CONTEXT.md`. **Can start now** for the decided part; sync rules wait on ticket 04.

## Stream: Google sync

### Decided
- Calendar: `events.watch` pings a Convex HTTP action, then a `syncToken` call fetches changes. A daily cron renews the 7-day channel. A 410 means full resync. A task with a clock time needs an event; Tasks keeps the date only. (ticket 02)
- Tasks: no push. Poll with `updatedMin`, with deleted, hidden and completed shown. (ticket 02)
- Echo guard: private extended properties and own event ids on events; stored etag plus hash on tasks. (ticket 02)
- Silent copy: empty default reminders on the RPM calendar and `useDefault:false` with no overrides on every event. (ticket 02)
- OAuth: production, unverified. Testing mode kills refresh tokens after 7 days. (ticket 02)

### Proposed
- PROPOSED: also poll Calendar every few minutes, since push is not fully reliable. Cost: a few extra calls a day.
- PROPOSED: scopes are `calendar.app.created`, `tasks`, and read-only calendar scopes for other calendars. The scope sensitivity is unknown, so this may change. (ticket 02 notes)

### Open questions
- The five unverified behaviours: silent events, Tasks `If-Match`, custom task ids, scope sensitivity, push delivery to a Convex URL. Owner: [ticket 11](tickets/11-google-live-check.md).
- Recurring events: edit one instance or the series. Research calls this the hardest case. No ticket owns it yet. Gap.
- Routing and conflict rules: [ticket 04](tickets/04-sync-model.md).

### Build pieces
1. Google Cloud project and live check (ticket 11). Done when: all five behaviours have a recorded result and the refresh token location is noted. **Can start now** (needs the user to sign in once).
2. Calendar link records and RPM-to-Google one-way push of events to the RPM calendar, silent. Done when: a test task appears in a throwaway calendar with no reminder. **Blocked** on 11.
3. Google-to-RPM pull with `syncToken`, echo guard. Done when: an edit in Google shows in RPM and an RPM write does not bounce back. **Blocked** on 04 and 11.
4. Tasks poll with hash echo guard. Done when: a completion in Google Tasks reaches RPM within 2 minutes. **Blocked** on 04 and 11.
5. Channel renewal cron and failure alert. Done when: a channel renews before expiry in a test, and a refresh failure sends an alert. **Blocked** on 11.

## Stream: Agent and VM

### Decided
- The agent runs on the small Oracle VM. Pi 1.3.0 with `claude-haiku-5-5` passed 3 of 3 runs. Peak about 120 MB of 954 MB. A 5-turn loop took 10.6 to 16.2 s, nearly all model time. (ticket 01)
- No bigger VM is needed now. (ticket 09)
- Pi is the agent. PicoClaw is the fallback. grokbot was rejected. (map; ticket 01)
- The user reaches it by Telegram. (map)
- It may change the plan without asking. Each Agent change is logged with its reason and can be undone. (map; `CONTEXT.md`)

### Proposed
- PROPOSED: one set of actions for all callers (list today, capture, move, complete, log meal, log water, read logs, undo an Agent change). Pi, Claude Code and Codex use the same set. The door is open (ticket 05). My lean: HTTP routes on Convex, since `convex/http.ts` already has an authenticated surface. A thin MCP wrapper can come later. Trade-off: HTTP needs a scoped token per caller; MCP helps coding agents discover tools but adds a service.
- PROPOSED: the agent never marks a Result achieved (`PRODUCT.md`). "Verifiable" means it re-reads the item after writing and logs the read-back. Cost: one extra call per change.

### Open questions
- Door and action set, and how each Agent change records its reason and Undo: [ticket 05](tickets/05-agent-door.md).
- What the Agent change log looks like, where the user reviews it, and what "verifiable" means. Listed in `map.md` as not yet specified. No ticket yet. Gap.
- Scheduled agent work (morning briefing, weekly review prep, nutrition estimates). No ticket yet.
- Deep planning on the laptop: coding agents only, or a view. No ticket yet.
- Not tested on the VM: long contexts, many tools, concurrent runs, Telegram. (ticket 01)

### Build pieces
1. Telegram to Pi on the VM, no RPM access yet, as a systemd service. Done when: a message gets a reply with the PC off. **Can start now.**
2. Read-only action set (list today, read logs). Done when: Pi answers "what is planned today" from live data. **Blocked** on 04 and 05.
3. Agent change record and Undo action. Done when: an agent edit shows its reason and one command reverses it. **Blocked** on 04 and 05.
4. Write actions (capture, move, complete, log meal, log water). Done when: each writes through the actor path and appears in the log. **Blocked** on 3.
5. Coding-agent access (Claude Code, Codex) with the same set. Done when: both can run the same list and capture calls. **Blocked** on 5's door.
6. Soak test on the VM (3 simultaneous runs, long context). Done when: memory stays under the limit. **Can start now.**

## Stream: LMS

### Decided
- Source: the public JSON feed at `https://evams.evamuse.chatgpt.site/api/site-data`. No login. No evams change. (ticket 03)
- Stable id `lms-<lmsContentId>`. The deadline is `submissionWindow.closesOn` plus `time`, in IST. (ticket 03)
- The feed is up to about 6 hours stale. It has no "submitted" flag. Its class timetable ends 2026-10-07. (ticket 03)
- Research questions are RPM tasks that link to a note path in `second-brain`. (map)

### Proposed
- PROPOSED: pull hourly from a Convex scheduled function or the VM. Upsert by key. Use `status` to detect cancelled or postponed, and a grace period for items that vanish. (ticket 03 recommendation; the grace period is my addition)
- PROPOSED: an assessment becomes a task with a fixed date and time inside an RPM block, not a Result. Reason: `PRODUCT.md` says a Result has no deadline field and derives it from tasks. Trade-off: needs a rule for which block holds it. A Result with a deadline would break that rule.
- PROPOSED: a deadline with no clock time becomes all-day. Trade-off: 23:59 sorts and clashes as a real time; all-day does not invent one. This matches the principle that deadlines are never invented.
- PROPOSED: assessments only (no timetable). No "submitted" sync; the user completes the task by hand.

### Open questions
- All four: [ticket 10](tickets/10-lms-deadlines-into-rpm.md), including .ics feed or Hermes push instead of a pull.
- If "submitted" must clear a deadline, a PC-bound step is needed. (ticket 03) Not decided.

### Build pieces
1. Feed adapter: fetch, map, upsert into a staging table, no plan writes. Done when: unit tests cover the sample feed and a cancelled item. **Can start now** (the afk-log says an adapter branch is already underway; confirm).
2. Plan-writing step with the chosen item type. Done when: a new assessment appears in Today at the right IST time. **Blocked** on ticket 10.
3. Change handling (moved date, cancelled). Done when: a changed `closesOn` updates the item and the old date is kept in History. **Blocked** on 2 and 04.

## Stream: Notch

### Decided (map)
- Black by default. The current task shows with a symbol on one side.
- Colour signals a change. Blue means water.
- Expanded: next 3 tasks, log a meal, quick capture, ask the agent.
- Routine progress ("3/5") and water ("5/8") show in the notch. (ticket 08)

### Proposed
- PROPOSED: build on an Android 16 Live Update first and test an accessibility overlay pill second. Trade-off: Live Update is reliable but has no colour control or custom expanded view (inferred, unverified). The overlay gives full control but is sideload only. A mix may be best. Do not choose before the phone test.

### Open questions
- Which approach meets the decisions: [ticket 06](tickets/06-notch-approach-prototype.md).
- States, colours per change, symbol set, motion, tap and long-press: [ticket 07](tickets/07-notch-design.md).
- Whether the overlay can cover the status bar at the cutout. Unverified.

### Build pieces
1. Two rough prototypes on the phone (Live Update, overlay pill). Done when: both run on the Samsung phone and a note records what each can and cannot do. **Can start now** (the afk-log mentions a prototype branch; nothing merges without the user).
2. Design pass: states, colours, symbols (ticket 07). Done when: checked at phone width and enlarged text. **Blocked** on piece 1.
3. Collapsed notch fed by the current task. Done when: it shows the real current task on the device. **Blocked** on 1 and 2.
4. Alerts for water and Routine. Done when: a water nudge turns blue and "Drank it" works from the notch. **Blocked** on 3 and the Health pieces.
5. Expanded view (next 3, log meal, capture, ask agent). **Blocked** on 3, ticket 05, and the meal log.

## Stream: Health

### Decided (ticket 08)
- Routine: fixed window on set days; done at the last tick or "Done all". Progress shows on Today and the notch. Skipped is not failed. Missed does not carry over. Event-tied routines wait for health data.
- Water: every 90 min, 8 AM to 10 PM, paused in busy events and sleep. "Drank it" logs 250 ml toward 8 glasses. "Snooze" waits 15 min.
- Meal log: slot guessed from the time. The 6 most frequent meals for that slot plus a text box. One tap saves. Edit or delete from History.
- Agent on meals: may add estimates, patterns and suggestions, stored apart and marked as guesses.
- Meal choice rests on a diet goal and budget. (map) Ordering and paying are out of scope. (map)

### Proposed
- PROPOSED: pause water by a user-set sleep window until Health Connect is wired. Wrong on odd nights, but simple.
- PROPOSED: after the logs exist, use Health Connect read-only for sleep first. Trade-off: low risk; steps and workouts have no clear consumer yet.

### Open questions
- What Health Connect data should feed once meal and water logs exist. In `map.md` as not specified. No ticket. Gap.
- How the diet goal and budget are entered, and what data the agent reads for meal suggestions. No ticket.

### Build pieces
1. Routine, Water log and Meal log entities and phone UI (the afk-log mentions a UI branch; nothing ships). Done when: `npm run test:js` passes and phone-width screenshots exist. **Can start now.**
2. Water reminder scheduling, local. Done when: a reminder fires at 90 minutes, pauses in a busy event, and "Drank it" adds one glass. **Can start now.**
3. Meal log quick-pick (6 frequent per slot). Done when: one tap saves, and edit or delete works from History. **Can start now.**
4. Sync of the three logs to Convex. Done when: a log made offline appears in Convex once. **Blocked** on ticket 04.
5. Agent meal estimates stored apart. Done when: an estimate shows as a guess and the user's words are unchanged. **Blocked** on Agent pieces 4.

## Risks

1. **No shared model yet.** Convex stores per-device records. Most pieces wait on ticket 04.
2. **Google behaviours unverified.** If silent events or `If-Match` fail, the silent-copy and conflict rules change. Run ticket 11 first.
3. **OAuth warning screen.** Production-unverified shows it once. Avoid many consent grants (100-user lifetime cap).
4. **Agent writes without asking.** Build the reason log and Undo before write actions (Agent piece 3 before 4).
5. **Echo loops.** Tasks has no private field and maybe no custom ids. A hash guard can misread a real edit as an echo.
6. **Notch.** The overlay cannot go on Play and Samsung may kill it. A Live Update may not allow the decided look.
7. **LMS data.** The feed lags up to 6 hours, has no submitted flag, and an `unlinked-` id can change with the title. A vanished item is not proof of removal.
