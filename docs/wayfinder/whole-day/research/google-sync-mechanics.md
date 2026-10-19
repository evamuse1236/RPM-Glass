# Google Calendar and Tasks two-way sync from Convex

Researched 2026-10-18 for ticket `02-google-sync-mechanics`. Primary sources only (Google Calendar API v3, Tasks API v1, Google identity docs, Convex docs). Each claim is labelled **stated** (the page says it) or **inferred** (my reasoning from stated facts). Pages were read through a fetch tool that summarises; quotes are the tool's extracts of the page.

## 1. Calendar: push vs polling, syncToken, channels

- **stated** `events.watch` exists. Endpoint `POST /calendars/{calendarId}/events/watch`. Body: `id` (unique), `type` (`web_hook`), `address`, optional `token`, optional `params.ttl`. Optional `eventTypes` filter. Response has `resourceId` and `expiration` (ms epoch). Source: https://developers.google.com/workspace/calendar/api/v3/reference/events/watch
- **stated** The callback "must use HTTPS" with a valid SSL certificate (not self-signed, revoked, or hostname-mismatched). Source: https://developers.google.com/workspace/calendar/api/guides/push
- **inferred** Convex HTTP actions qualify. They are served at `https://<deployment>.convex.site` and the docs say they "might be used for receiving webhooks from external applications". Google's page does not name Convex; I did not test a live channel. Source: https://docs.convex.dev/functions/http-actions
- **stated** A push notification has no body. It "do[es] not contain specific information about updated resources". Headers carry channel id, resource id, resource state, message number. You must make another API call to learn what changed. Source: push guide above.
- **stated** First message is a `sync` message (`X-Goog-Resource-State: sync`, message number 1); safe to ignore. It may arrive before the `watch` response.
- **stated** Notifications are not fully reliable; the app should still sync if messages are missed (push guide).
- **stated** Channel TTL default is 604800 s (7 days) (`params.ttl`, watch reference). The push guide says an expiry can come from the request or Google's own limits and "the more restrictive value is used", with no default stated there.
- **stated** "There's no automatic way to renew a notification channel." Call `watch` again with a new unique `id` before expiry; the two channels overlap. Stop with `POST /channels/stop` (`id` + `resourceId`).
- **inferred** Renewal needs a scheduled job (Convex cron) that re-watches daily, and the handler must accept messages from both channels during overlap.
- **stated** Incremental sync: do a full list, keep `nextSyncToken` (only on the last page), then send it back to get only changes. Incremental results "will always contain deleted entries". Source: https://developers.google.com/workspace/calendar/api/guides/sync
- **stated** A bad or expired token returns HTTP 410 (`fullSyncRequired`). Wipe the local store and run a full sync. Token lifetime is not stated. Sources: sync guide; https://developers.google.com/workspace/calendar/api/guides/errors
- **stated** `syncToken` cannot be combined with `iCalUID`, `orderBy`, `privateExtendedProperty`, `q`, `sharedExtendedProperty`, `timeMin`, `timeMax`, `updatedMin`. `showDeleted` cannot be false with a token. Page size default 250, max 2500. Source: https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- **inferred** Because the token cannot be filtered by `privateExtendedProperty`, filter our own writes client-side after the sync call.
- **inferred** Polling is a valid fallback: a one-minute `syncToken` call with no changes should return an empty page cheaply. Google recommends push over polling for quota reasons (section 6).

## 2. Tasks API: push, fields, limits

- **stated** Tasks v1 has two resources (`tasklists`, `tasks`) and 14 methods. None is `watch`, `channels`, or push. Source: https://developers.google.com/workspace/tasks/reference/rest
- **inferred** No push exists for Tasks. Absence in the method list is the evidence; no page says "not supported".
- **stated** `tasks.list` has `updatedMin` (RFC 3339), `showDeleted`, `showHidden`, `showCompleted` (default true; `showHidden` must also be true to see tasks completed in first-party clients), `maxResults` (max 100, default 20), `pageToken`. Source: https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list
- **inferred** Poll with `updatedMin = last poll time`, `showDeleted=true`, `showHidden=true`, `showCompleted=true` to see edits, deletes, and completions. Not tested. There is no `syncToken` for Tasks.
- **stated** Task fields: `id`, `etag`, `title` (max 1024), `updated` (read-only), `parent` (read-only; change with `move`), `position` (read-only; change with `move`), `notes` (max 8192), `status` (`needsAction` or `completed`), `due`, `completed`, `deleted`, `hidden` (read-only), `links` (read-only). Source: https://developers.google.com/workspace/tasks/reference/rest/v1/tasks
- **stated** `due`: "Only the date is stored; any time portion is discarded on write. The API can't read or write a scheduled time." It is the day to do the task, not a deadline. Same page.
- **stated** TaskList has `id`, `etag`, `title` (max 1024), `updated`. Source: https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists
- **stated** Tasks quota: a courtesy limit of 50,000 queries per day. Per-minute limits and list-size limits are not stated. Source: https://developers.google.com/workspace/tasks/limits

## 3. Telling our own writes from user edits

Calendar:
- **stated** `extendedProperties.private` is writable key-value strings, visible only on this calendar's copy. Key max 44 chars, value max 1024, 300 properties / 32 kB per event. Source: https://developers.google.com/workspace/calendar/api/guides/extended-properties
- **stated** You can choose your own event `id` on insert (lowercase a-v and digits 0-9, 5-1024 chars, unique per calendar). A repeat insert with an existing id fails with 409. This prevents duplicates after a half-failed create. Sources: events reference https://developers.google.com/workspace/calendar/api/v3/reference/events ; create-events guide https://developers.google.com/workspace/calendar/api/guides/create-events ; errors page.
- **stated** `etag` changes when the resource changes. `If-Match` on update/delete returns 412 if it changed. Source: https://developers.google.com/workspace/calendar/api/guides/version-resources
- **stated** `updated` is the last modification of the main event data; "Changing reminders does not update it." Events reference.
- **inferred** Echo guard for events: after every write, store the returned `etag` and `updated` in Convex. When the sync call returns an event whose etag equals the stored one, skip it. Also write `extendedProperties.private.rpmId` and a `rpmVersion` counter so a user edit in Google (which keeps the properties) can be compared with our last version. Reuse our own event `id` as the join key.
- **inferred** `If-Match` gives optimistic locking: if Google changed the event since we read it, we get 412 and can run the "latest edit wins, loser goes to History" rule instead of overwriting blindly.

Tasks:
- **stated** Tasks have `etag` and `updated`, but no `extendedProperties` field.
- **stated** The `tasks.patch` page does not mention `If-Match` or etag preconditions, so conditional writes are not confirmed. Source: https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/patch
- **stated** I found no custom-id option for `tasks.insert` in the pages read. (Not checked on the insert page itself. **UNVERIFIED**.)
- **inferred** For Tasks, keep a map in Convex of `googleTaskId -> {etag, updated, content hash}` after every write. Treat a returned task whose etag matches the stored one as our echo; a different etag or hash is a user edit. RPM's id could go in `notes` as a hidden marker, but that pollutes the notes the user sees.

## 4. Silent events

- **stated** `reminders.useDefault` (boolean) and `reminders.overrides[]` (max 5; `minutes` 0 to 40320; method `email` or `popup`). The create-events guide shows `useDefault: false` with explicit overrides. Sources: events reference; create-events guide.
- **inferred** `useDefault: false` with `overrides: []` should give an event with no reminders. The docs do not say so in so many words. **UNVERIFIED**: test once with a real event.
- **stated** `calendarList.defaultReminders[]` is writable (method, minutes 0 to 40320). `notificationSettings` is writable too (email only: eventCreation, eventChange, eventCancellation, eventResponse, agenda). Source: https://developers.google.com/workspace/calendar/api/v3/reference/calendarList
- **stated** `calendars.insert` requires only `summary`. It says nothing about default reminders. Source: https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert
- **inferred** What a new calendar gets as defaults is not documented. After creating the RPM calendar, set `defaultReminders: []` and check `notificationSettings` through `calendarList.patch`, and still set `useDefault:false, overrides:[]` on every event. Both layers together make the Google copy silent.
- **inferred** Google Tasks reminders are not a field in the Task resource, so the task copy carries none through this API.

## 5. OAuth for one personal account

- **stated** Testing mode: refresh tokens expire after 7 days, unless the only scopes are a subset of name, email, profile. Test users are capped at 100. Sources: https://developers.google.com/identity/protocols/oauth2 ; https://support.google.com/cloud/answer/15549945
- **stated** Other refresh-token endings: unused for 6 months; user revokes; password change if Gmail scopes; max 100 tokens per account per client (a new one silently kills the oldest).
- **stated** "In production" status lets any Google user authorize it (Publish app button). Requesting sensitive or restricted scopes without verification shows an "unverified app" warning and caps the app at 100 new users for the project's lifetime. Source: support.google.com/cloud/answer/15549945.
- **inferred** One personal account stays far under 100 users, so Production-unverified avoids the 7-day expiry at the cost of a warning screen at consent time. The 7-day rule is documented only for Testing status. The cap is a lifetime count, so do not create many consent grants from throwaway accounts or projects.
- **stated** Calendar scopes include `calendar`, `calendar.events`, `calendar.events.owned`, `calendar.app.created` ("Create secondary calendars and view, change, and delete events on them"), `calendar.calendarlist.readonly`, `calendar.calendars`, and read-only variants. The scopes page gives no sensitivity labels. Source: https://developers.google.com/workspace/calendar/api/auth
- **stated** `events.watch` accepts `calendar.app.created`, `calendar.events`, `calendar`, and others. `calendars.insert` accepts `calendar`, `calendar.app.created`, `calendar.calendars`.
- **stated** Tasks scopes: `tasks` (full) and `tasks.readonly`. Source: https://developers.google.com/workspace/tasks/auth
- **inferred** `calendar.app.created` covers the RPM calendar (create it, read/write its events, watch it) but only calendars the app created. Reading the user's other calendars read-only needs extra scopes: `calendar.readonly`, or `calendar.calendarlist.readonly` plus `calendar.events.readonly`. Narrower is better, but two scope sets in one grant is the simple path.
- **UNVERIFIED** Whether Google marks these scopes sensitive (which drives the unverified warning). Neither scope page states it.

## 6. Quotas relevant to polling every minute

- **stated** Calendar: 10,000 requests per minute per project; 600 per minute per user per project; sliding window; 1,000,000 requests/day before charges planned for later in 2026. Over-limit returns 403/429. Back off with truncated exponential backoff (`min(2^n + random ms, 32 or 64 s)`). Source: https://developers.google.com/workspace/calendar/api/guides/quota
- **stated** Google recommends push over polling and warns that polling every user each minute can use up quota fast. Same page. Vary regular intervals by about 25 percent.
- **stated** Calendar 403 `quotaExceeded` ("Calendar usage limits exceeded") is a separate abuse guard. The page does not give numbers. Also, "rapid writes to a single calendar" may hit unspecified limits. Sources: errors page; quota page.
- **inferred** One user polling Calendar once a minute is about 1,440 calls a day (0.24 percent of the daily line, 0.17 percent of the per-user per-minute limit). Tasks once a minute is about 1,440 a day against 50,000. Both are comfortable.
- **stated** Convex crons: `crons.interval` accepts `seconds`, `minutes`, or `hours`. At most one run per job at a time; slow runs cause skipped runs. Cron can call an action. Source: https://docs.convex.dev/scheduling/cron-jobs
- **stated** Convex scheduled and HTTP calls count as function calls. Free plan has 1,000,000 function calls per month. Actions have 20 GB-hours/month compute on Free. Source: https://docs.convex.dev/production/state/limits
- **inferred** A one-minute cron is about 43,200 runs a month for each job. Two jobs plus push handlers sit near 100,000 calls, a small share of the free allowance. Not measured.

## 7. Round-trip field fidelity

| Concept | Calendar event | Task |
|---|---|---|
| Title | `summary` | `title` (max 1024) |
| Notes | `description` (may contain HTML) | `notes` (max 8192) |
| All-day vs timed | `start.date`/`end.date` (end exclusive) vs `start.dateTime`/`end.dateTime` | Date only; time discarded on write |
| Time zone | `dateTime` needs offset or `timeZone` (IANA); required for recurring | None |
| Recurrence | `recurrence[]` RRULE/RDATE/EXDATE (no DTSTART/DTEND); instances via `recurringEventId`, `originalStartTime` | None in API |
| Completion | Not applicable | `status` + `completed` timestamp |
| Reminders | `reminders.useDefault`, `overrides` (max 5) | None |
| Hierarchy / order | None | `parent`, `position` (change only via `move`) |
| Deleted | `status: cancelled`, returned in incremental sync | `deleted: true` (needs `showDeleted`) |

All table rows are **stated** (events reference and tasks reference above) except the "None" cells, which are **inferred** from absence in the resource tables.

- **inferred** A timed RPM task has no Google Task equivalent for its time: it must live as an event, and the task copy gets the date only. Round trip of a time-of-day through Tasks loses it.
- **inferred** `completed` on an RPM task maps to Task `status`, but the original "result achieved" meaning in RPM (see `PRODUCT.md`) has no Google counterpart. Keep it in Convex only.
- **inferred** Recurring event edits (one instance vs the series) are the hardest case. Instances carry `originalStartTime` as identity, which gives a stable join key.

## What this means for the sync model

1. **Calendar: push plus a cron backstop.** Register `events.watch` on the RPM calendar pointed at a Convex HTTP action. On a ping (or every few minutes as a fallback), run an action that calls `events.list` with the stored `syncToken`. Renew the channel daily with a cron. On 410, full-resync.
2. **Tasks: poll only.** There is no push. One cron every minute with `updatedMin`, `showDeleted`, `showHidden`, `showCompleted`. Quota is not a concern.
3. **Echo guard.** Events: store `etag`/`updated` after each write, put an RPM id in `extendedProperties.private`, and use our own event ids. Tasks: store `etag` and a content hash per Google task id; no private field exists.
4. **Latest edit wins.** Compare Google `updated` with Convex's own edit time; write the loser to History. For events, `If-Match` stops a write over a newer Google edit. Tasks may lack that check, so re-read just before writing.
5. **Silent copy.** Set `defaultReminders: []` on the RPM calendar and `useDefault:false, overrides:[]` on every event. Verify once with a real event.
6. **Time-of-day lives on events.** Tasks have a date only. A task that needs a clock time must be mirrored as an event, or its time stays only in RPM.
7. **OAuth.** Use Production status (unverified is fine for one user) so the refresh token does not die at 7 days. Expect one warning screen. Scopes: `calendar.app.created` for the RPM calendar, `tasks`, plus read-only calendar scopes for other calendars. Store the refresh token as a Convex secret and alert if refresh ever fails.
8. **Open checks before building (UNVERIFIED):** silent-event behaviour with empty overrides; defaults on a new calendar; whether the Tasks API honours `If-Match`; whether `tasks.insert` allows a custom id; scope sensitivity labels; real channel delivery to a `.convex.site` URL.
