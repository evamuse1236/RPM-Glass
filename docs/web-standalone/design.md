# Standalone website: design (v2)

Status: 2026-10-28. Synthesized from two architect runners (Opus, GPT-6.1 Sol), a GPT cross-judge, and two adversarial reviews (`interrogate`, Opus and GPT). v1 (three equal replicas) was revised because both reviewers found its browser-replica and repair rules unsafe, and the judge and reviewer B pointed at a smaller shape. Read `brief.md` first.

## The user rule

**If your phone and the website change the same detail of a task while apart, the newer change wins, and the other version is kept: it is added to the task's notes and listed on the website.**

Different details of one task both survive. A deleted item stays deleted; an edit made to it on the other side is kept as a conflict note.

## Shape

The server is the hub. It holds the planner as one row per record.

- **Website and server Capture write on the server.** A website change is the same `plan` command as today (`{id, type: 'plan', args: {op, ids}}`). A Convex mutation loads the account's records into a store, runs `editPlan(store, op, now)`, and writes back the records that changed, in one transaction. The command is `applied` at once. The browser keeps today's outbox, optimistic replay (`plan-queue.mjs`) and snapshot polling; only the waiting words change ("Saving" for about a second, not "Waiting for your phone").
- **The phone is the one offline replica.** It diffs its store's public records against `sync.base` (the last values it agreed with the server), pushes the changes, and pulls every record changed since its cursor. The server merges each phone change field group by field group with the user rule.
- So there are two writers to merge (phone, server), one merge function, and no browser replica state, leases, or tab coordination.

## Records

`web/contract/records.json` is the only list of synced kinds. JS (`records.mjs`) and Java (`SyncStamps.java`) read it; a golden fixture (`fixtures/record-keys.json`) proves they locate the same records and groups.

| Kind | Store location | Key |
|---|---|---|
| `task` | `entries[]` where `(kind ?? 'plan') === 'plan'` | `id` |
| `block`, `project`, `area`, `goal` | `planner.<plural>[]` | `id` |
| `context` | `planner.context` | `main` |
| `week`, `review` | `planner.weeks`, `planner.reviews` | week day |
| `waterSettings`, `waterSnooze` | `planner.body.water.settings`, `.snoozedUntil` | `main` |
| `glass` | `planner.body.water.glasses[]` | `<instant>#<n>` |
| `meal`, `routine` | `planner.body.meals[]`, `.routines[]` | `id` |
| `mealSlot` | `planner.body.mealPlan.slots[]` | `slot` |
| `run` | `planner.body.runs[]` | `routineId|day` |
| `mealGuess` | `planner.body.mealGuesses` | meal id |
| `capture`, `draft` | phone Capture summaries (phone-owned) and server Capture rows | message id, draft id |

- A value is the public allowlisted store-shaped value (`snapshot.schema.json` `$defs`, moved to `records.schema.json`).
- `applyRecord` keeps local-only fields (`revisions`, undeclared fields) and deletes declared fields the value lacks. `checkin` entries never leave the phone.
- `reviewActivityDays` is derived from local `revisions`; the phone keeps pulled days in `sync.remoteActivity` and projects `local ∪ remote`.
- Entity list order is creation order: `applyRecord` inserts new entities by `(created, id)`.
- **Field groups** (in `records.json`) merge as one unit, because their fields are only valid together: task `schedule` (`planned`, `plannedDate`, `recurrence`, `repeatDays`, `repeatAfterDays`, `completedOccurrences`), task `completion` (`done`, `state`, `completedAt`, `completions`), task `archive` (`archived`, `archiveDisposition`), task `alertIntent`, goal `period` (`year`, `horizon`, `period`), task `order` (`blockId`, `priority`). Every other top-level field is its own group.

## Server tables (`convex/schema.ts`)

- `plannerRecords {account, key, rev, value | null (tombstone), stamps: {group: editedAt}}`, indexed by `(account, key)` and `(account, rev)`.
- `accounts` gains `nextTaskId` (starts at 1,000,000,000), `seededAt?`, and keeps `cursor` as the record revision counter.
- `webCommands` stays as the browser's durable receipt table (id, payload identity, status, message, newRevision) plus `inverse: {key, rev, before, after}[]` for Undo.
- `phoneSync {account, device, lastSeq, lastReceipt}`: one row per phone, for idempotent pushes.
- `captures {account, messageId, text, timezone, status, attempts, claimedUntil, message?, question?, receipt?, draftId?}` and `captureState {account, kind: 'capture' | 'draft' | 'transaction', id, value}` (one document per item, so no single document grows past 1 MB).
- Deleted: `plannerSnapshots`.

## Website writes (`convex/plannerWrite.ts`)

`applyPlan(ctx, account, command)`:

1. Load all records into a store (`storeFromRecords`), the same shape `editPlan` uses on the phone.
2. New task IDs: the browser proposes them in `args.ids`; the server accepts a proposed task ID only if it is ≥ 1,000,000,000 and unused, otherwise it takes `accounts.nextTaskId`. New entity UUIDs keep today's `withIds` rule.
3. Run `editPlan`. Diff `projectRecords` before and after. Write changed records with a new rev each, stamping changed groups with `now`. Store `inverse` (before/after values and revs) on the command row.
4. `validatePlanner` already ran inside `editPlan`; a throw becomes `rejected` with `userMessage(error)`.
5. The same command ID returns the stored receipt (today's identity rule).

Website Undo (`type: 'undo', args: {commandId}`): for each inverse entry, if the record's rev is unchanged, restore `before`; otherwise restore `before` only for groups whose current value still equals `after`, and keep newer groups. Then `validatePlanner` on the result; if it fails, `conflict` with "This changed since; Undo it on the phone after reviewing." The response says when something newer was kept.

The snapshot route (`GET /v1/web/snapshot`) builds the same schema-v2 snapshot from records (`snapshotFromRecords`), revision = `accounts.cursor`, with today's ETag rule. The browser code that reads it does not change.

## Phone sync (`android-companion/replica-sync.mjs`, run in `sync.html`)

State in the store's top-level `sync` key (local-only; never projected; never in an Undo image; kept across `importCopy`):

```ts
type SyncState = {
  cursor: number;
  base: Record<Key, {rev: number; value: Value | null}>;
  stamps: Record<Key, Record<Group, string>>;         // local edit times, only while a record differs from base
  outbox: null | {seq: number; sent: Record<Key, Value | null>; changes: Change[]};
  seq: number;                                         // monotonic push sequence
  nextTaskId: number;                                  // durable, < 1,000,000,000, never decreases
  remoteActivity: Record<string, string[]>;
  restoredAt?: string;                                 // set by importCopy until the next completed sync
};
type Change = {key: Key; baseRev: number | null; base: Value | null; value: Value | null; stamps: Record<Group, string>};
```

One run:

1. **Freeze.** If `sync.outbox` is empty, compute `localChanges(store)` against base, in dependency order (area, goal, project, block, then the rest), and save `outbox = {seq: seq + 1, sent, changes}` with CAS. A pending outbox is resent unchanged.
2. **Push.** `POST /v1/planner/sync {seq, changes, cursor}` in chunks of at most 200 changes and 800 KB; the last chunk says `final: true`. The server applies a seq at most once: a seq ≤ `phoneSync.lastSeq` returns `lastReceipt`. Merged values come back in the receipt.
3. **Pull.** Page through `records` with `rev > cursor` (500 per page) and stage all pages in memory. Apply nothing until `hasMore` is false.
4. **Apply** (CAS, retried on conflict), per key, with `sent` as base, the server value as theirs, and the live store as ours: take the server value for groups where the live value still equals `sent`; keep the live value (and its stamps) where it moved during the trip. Then `rebaseUndo`, then `validatePlanner`. Save the store, `base`, `cursor`, cleared outbox and cleared stamps for applied groups in one write, with `origin: "sync"` so it stamps nothing.
5. If a crash happens anywhere, the next run resends the same outbox seq and re-pulls from the old cursor.

**Seeding.** The first sync (no `sync` key) pulls first. If the server has no records, it pushes everything with `baseRev: null` and the server sets `seededAt` on the final chunk. If the server already has records (a re-paired or reinstalled phone), it adopts the pulled values as base and pushes only differing groups, stamped with the store's `syncSavedAt`, so they lose to anything newer.

**Restore from backup.** `importCopy` keeps the live `sync` key, stamps changed groups with the backup's `syncSavedAt` (not now), and sets `restoredAt`. While `restoredAt` is set, `localChanges` emits no deletes. A restore can bring back old values; it never removes newer website work.

## Merge (`web/contract/merge.mjs`, pure, used by the phone-sync mutation)

Per phone change against the server row:

1. No row: take the value. `baseRev === null` on an existing row: three-way with `base = null`.
2. `row.rev === baseRev`: take the value.
3. Tombstone: stays deleted unless `baseRev` is the tombstone's rev (the phone saw the delete; for example its Undo restored the record). Otherwise the pushed value becomes a conflict record.
4. Phone delete against a newer server edit: delete wins; the edited value becomes a conflict record.
5. Otherwise per group `g`: if the phone's value equals base, keep the server. If the server's equals base or equals the phone's, take the phone's. Set fields (`completedOccurrences`, `reviewActivityDays`) and keyed lists (`completions` by `occurrence`, run `marks` by step) merge by element. If both changed, the newer stamp wins (stamps are clamped to `now`; a tie keeps the server). The loser becomes a conflict record; for tasks and entities with a text loser, one line is appended to `notes` ("Changed on two devices. Kept title 'X'. Other version from your phone: 'Y'."). The `order` group never writes a conflict.
6. After all changes in a push, the server loads the store, runs `repairLinks` (only against tombstoned targets: a task whose Block was deleted moves to the Inbox, a deleted routine's runs go, deleted Blocks leave week focus), then `validatePlanner`. A record that still fails keeps its server value and the phone's value becomes a conflict record. Repairs and conflicts are written by the server only.

Conflict records (`conflict:<uuid>`, server-owned): `{key, group, kept, lost, lostFrom, at}`. The website shows them in its notes list with a dismiss button.

## Every phone write is seen

`CompanionStore.write(context, data, expected, origin)` calls `SyncStamps.stamp(old, next)` before `writeRaw` unless `origin` is `sync`, so stamps land in the same atomic file. It finds records and groups from `records.json` and compares raw subtrees (no projection logic in Java). All three bridges (`CompanionActivity`, `NotchRunner`, `PlannerCommandHost`) pass `origin`; only the sync runtime sends `sync`.

## Task IDs

The phone's three allocators (`planner-state.mjs` saveTask, `companion-tools.mjs:67`, `legacy-import.mjs`) call `nextTaskId(data)` from `task-ids.mjs`: it uses `sync.nextTaskId` (initialized to `1 + max` of all entry and Undo-image IDs), stays below 1,000,000,000, and never decreases. The server allocates from 1,000,000,000 up. All IDs stay below 2^31 for `CompanionAlerts`' `(int)id`. A `check:rules` rule refuses `max(...)+1` task allocation outside `task-ids.mjs`.

## Undo on the phone

The Undo shape stays. `rebaseUndo` copies each group the server changed (server value differs from `sent`) into every Undo image (`planner.undo`, the `data.undo` chain), adds remote creates and removes remote deletes. Each rebased image is checked with `validatePlanner`; an image that fails is dropped and Undo says "This changed on another device." (Example: Undo of a Block's creation after the website put a task in it.)

## Server Capture

1. `capture` command (`{id, type: 'capture', args: {text}, timezone}`) inserts the `captures` row (`saved`, exact words) and a `capture:<id>` summary in one mutation and schedules `captureRun.run`. Same ID returns the existing row.
2. `captureRun.run` (`"use node"`) claims the row (`attempts + 1`, `claimedUntil = now + 5 min`), sets `process.env.TZ` to the row's timezone (captures run one at a time per account, enforced by the claim), loads records and this account's `captureState`, and runs `createCaptureAgent` with: the Anthropic `fetch` from `scripts/capture-stress/api.mjs`, `readCalendar` returning unavailable, `undo` from `companion-tools`, a memory trace sink. An already-interpreted capture resumes with `retry(messageId)`.
3. The store backend's `save(expected, next)` is one mutation: check `captureState` versions, write changed records through the same path as `applyPlan` (server stamps, inverse kept on the capture row), write changed `captureState` items, and set the capture's outcome. So tasks and outcome land together; a crash after it cannot apply twice.
4. Outcomes: `applied` (receipt lines, task IDs), `needs-answer` (question; the next words go to the same conversation), `words-kept` (model failure; Send again retries). A cron every 5 minutes re-runs rows that are `saved` or have an expired claim, at most 3 attempts.
5. Capture Undo uses the website Undo rule on the capture's inverse.

## Auth and migration

- The device token writes as the phone. Web sessions and the Site key write through `applyPlan` and start Captures. Revocation, quotas, link codes and the Site Worker stay as they are.
- Deploy order: (1) Convex with the new tables and routes; `/v1/planner/sync` keeps answering the old phone protocol with 410 so the old app shows "waiting to sync" and keeps its data. Prod pending `webCommands` must be 0 first. (2) APK: first sync seeds. (3) Site publish. (4) Drop `plannerSnapshots` and old code.
- Old browser outbox entries are `plan` commands with stable IDs; the new server applies them on resend. Nothing is discarded.

## Module map

New: `web/contract/records.json`, `records.mjs`, `records.schema.json`, `merge.mjs`; `android-companion/replica-sync.mjs`, `undo-rebase.mjs`, `task-ids.mjs`; `app/.../SyncStamps.java`; `convex/records.ts` (store load/write, phone sync), `convex/plannerWrite.ts`, `convex/captures.ts`, `convex/captureRun.ts`.

Changed: `planner-state.mjs`, `companion-tools.mjs`, `legacy-import.mjs`, `new-id.mjs` (`globalThis.crypto.randomUUID`), `sync-runtime.mjs`, `CompanionStore.java` and its three callers, `PlannerCommandHost.java`, `PlannerSyncProtocol.java`, `convex/planner.ts`, `plannerHttp.ts`, `schema.ts`, `web/app/client.mjs` (timezone on capture), `sync-marks.mjs` and `main.mjs` (words only, plus conflict notes), `scripts/web-sync/phone-standin.mjs`.

Deleted: `web-sync-commands.mjs`, `web-sync-snapshot.mjs` (projection moves to `records.mjs`), the phone's command processor in `sync-runtime.mjs`, the `plannerSnapshots` table. `web-sync-targets.mjs` goes if nothing else needs it.

## Landing order (each unit ends in a check)

1. **Records and merge** (pure): `records.json/mjs`, `merge.mjs`, golden keys. Check: tests for each merge rule, groups, sets, tombstone resurrection, natural-key creates, repair only on tombstones, a goal period conflict that stays valid.
2. **Server writes**: `storeFromRecords`, `applyPlan`, Undo by inverse, `snapshotFromRecords`, server task IDs. Check: `cloud-tests` (add, edit, complete, Undo after a later phone edit keeps it, snapshot equals today's projection on the seed fixture).
3. **Capture spike**: local Convex Node action with a fake model. Check: one capture makes one task in India time; a crash after save does not duplicate.
4. **Phone replica core**: `replica-sync.mjs`, `undo-rebase.mjs`, `task-ids.mjs`, phone sync mutation. Check: simulation with a fake server over three offline days; an edit during the trip survives; crash after push resends the same seq; restore never deletes; reinstall adopts base; partial pull applies nothing.
5. **Java**: `SyncStamps`, `origin` through the three bridges, `importCopy`, transport. Check: JUnit with the golden fixture; alerts with ID 1,000,000,007.
6. **Website wiring and Capture UI words**, stand-in phone on the new protocol. Check: `web:drive` plus `drive-offline.mjs` (stand-in stopped: add, edit, complete, AI Capture; reconnect; same-task conflict; Undo after a phone edit).
7. **Emulator scenario** `web-sync-offline`: the real app against local Convex; airplane mode; edits on both sides; reconnect; `rpmctl state` shows both. Check: `rpmctl scenario web-sync-offline`, then `npm run ci:emulator`.
8. **Subtract and document**: delete old code and table; rewrite `docs/web-sync.md` and the `AGENTS.md` web sync rows with their tests. Check: `npm test`.

## Rejected

- Browser as a full replica (v1): needed leases, tab coordination, partial-pull repair and per-session replica identity; both reviewers found loss paths there.
- Server arrival order as the rule: an edit from a phone offline for three days would beat this morning's website edit.
- Whole-batch phone conflicts with manual recovery: one conflicting task would park days of unrelated phone edits.
- Replacing the phone's three Undo engines with record inverses: large and touches Capture internals; image rebasing plus validation covers it. The server uses inverses because it has no images.
- CRDT libraries; UUID task IDs (break alarms, receipts and review ID lists).

## Known limits

- Two glasses logged at the same millisecond on phone and server merge into one.
- A phone clock that runs slow loses same-detail conflicts it should win; stamps are clamped to the server's now, not corrected.
- Server Capture sets `process.env.TZ` per run; it is safe because one account's captures run one at a time and the planner has one user.
