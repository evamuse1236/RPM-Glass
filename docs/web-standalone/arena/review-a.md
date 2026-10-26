# Review A: standalone website design (adversarial)

Read-only review of `docs/web-standalone/design.md` against the code on `feat/web-standalone`. Ranked most severe first. Labels: measured = read in code; inferred = follows from the design text; guess = not checked.

## 1. BLOCKER: a receipt or pull applied after newer local edits reverts the remote change or drops the local edit

Scenario (inferred): the website freezes outbox `{task 7: title 'A'}` and sends it. While the request is in flight (3 s polling, so this is common), the user edits task 7 `minutes`. The server merges in a phone edit to `notes` and returns `results: [{key: task:7, value: merged}]`. The replica sets `base[task:7] = merged`. Its store still holds the old `notes`. Now one of two things happens:
- It does not write `merged` into the store: next `localChanges` sees `notes` differ from base. The merge sees `s == b`, so it takes the stale `notes`. The phone's edit is silently reverted.
- It writes `merged` over the store record: the `minutes` edit made during the flight is lost.

The same race hits the phone: the sync runtime saves with CAS after a network round trip, and the planner page, notch or Capture may have written in between (`CompanionStore.write` CAS, `CompanionStore.java:31`).

The design states how Undo images rebase, but not how the live store absorbs a receipt or pull when it has moved since the outbox froze.

Fix: in `applyPulled`, do a local three-way per field: `sent` (the frozen outbox value) as base, `merged` as theirs, live store as ours. Take `merged` where the live value still equals `sent`; keep the live value otherwise. Keep the stamps for kept fields. Add a test: an edit lands between freeze and receipt, and both edits survive.

## 2. BLOCKER: link repair on a partial pull deletes real links

Scenario (inferred): the first seed pushes about 1,000 records in requests of at most 200 changes. The records table lists `task` first, so the first requests hold tasks whose `blockId` points to Blocks not yet sent. The website pulls between two seed requests (or pulls page 1 of 2 with `hasMore`). `repairLinks` "runs after each pull" and nulls every `blockId`. It then pushes `blockId: null` with `b = B`, `s = B`, so the merge takes null. The phone pulls and loses every Block assignment. A conflict record exists, but the user sees all tasks unsorted.

The same thing happens in normal use when one push spans two requests (a Capture that creates a Block and its tasks, a `draftSort` of 60 tasks).

Fix:
- Push in dependency order (area, goal, project, block, then task).
- Apply pulled pages only when `hasMore` is false.
- Repair a link only when the target is a known tombstone, never when it is merely absent.

Also: three replicas each run the same repair and each write a conflict record. Let only the server, or only the replica whose push made the dangling link, write it.

## 3. MAJOR: field-wise merge breaks per-record invariants, so `validatePlanner` fails on every replica

Measured: `validatePlanner` (`planner-state.mjs:18-26`) checks `goal.period` against `goal.horizon` (`integer(g.period, 1, 4)` for quarterly), unique entity ids, titles, ratings, and `minutes` range.

Scenario: base goal `horizon: monthly, period: 11`. The phone changes it to `quarterly, 3`. The website changes `period` to 12. The newer stamp wins `period`, and the result is `quarterly, 12`. Every later `editPlan` on that replica throws, because `validatePlanner` runs on each commit (`planner-state.mjs:161`). The website gets stuck. Similar coupled fields: task `planned` / `plannedDate` / `recurrence`, `state` / `done` / `archived`, goal `year` / `horizon`.

Step 6 of the merge runs only `normalizeTask`.

Fix: declare field groups in `records.json` that merge as one unit (newest stamp takes the whole group). Run a per-record validator on the server after the merge. If it fails, keep the server value and write a conflict record.

## 4. MAJOR: natural-key creates from two replicas become conflicts instead of merging

The guard reads: "the server refuses a `baseRev: null` create whose key already exists from another replica; the value becomes a conflict record." It suits integer task IDs. But `week`, `review` (week day), `run` (`routineId|day`), `mealSlot`, `mealGuess`, and `glass` keys are natural keys. Two replicas create them independently while apart.

Scenario (inferred): the phone is offline Monday and plans this week's focus. The website plans the same new week. The second arrival loses its whole week record to the conflict list, even when the fields do not overlap. The same applies to logging the same routine run on both sides.

Fix: treat `baseRev: null` on an existing key as a three-way merge with `base = null`. Keep the refusal only for task and UUID kinds.

## 5. MAJOR: restoring a backup deletes newer website work and floods conflicts

Measured: `importCopy` calls `writeRaw` directly, not `write` (`CompanionStore.java:33-38`). The design keeps the live `sync` key and stamps every changed field with the restore time.

Scenario (inferred): the user restores a backup from two weeks ago.
- Every task the website created since then is in `sync.base` but missing from the store. `localChanges` pushes deletes, and rule 4 makes "delete wins" against them.
- Every field the backup holds at an older value gets a stamp of "now". So it beats this morning's website edits.
- After a fresh install, there is no `sync` key. Every record is pushed as `baseRev: null` and becomes a conflict record: hundreds of them.

Fix: treat a restore as a merge source, not as local edits. Never emit deletes from a restore. Stamp fields with the backup's own `syncSavedAt`. On a fresh install with server data present, pull first and adopt the pulled values as base, then push only the fields that differ.

## 6. MAJOR: two tabs of one browser share one replica state

Measured: the website has no tab coordination (no `BroadcastChannel`, `navigator.locks` or `storage` listener in `web/app/`). It keeps its state in `localStorage` (`client.mjs:20`, `plan-queue.mjs:37`).

Scenario (inferred): tab A pulls and writes the new `sync.base` and cursor. Tab B still has an older store in memory. It diffs against A's base and pushes the old values as changes, which reverts remote edits. Both tabs also resend one frozen outbox under one `requestId`, and they share one lease.

The design does not say where the website keeps its store or its unsent edits across a reload.

Fix: make one replica per tab, with the id in `sessionStorage` and the outbox persisted per replica. Or elect one leader with `navigator.locks`. Add a two-tab case to `drive-offline.mjs`.

## 7. MAJOR: a server Capture retry can apply twice

Step 4 says a cron re-runs `sorting` rows older than 10 minutes, up to 3 tries.

Scenario (inferred): the `save` mutation commits the tasks, then the action dies before it marks the capture `applied`. The cron runs it again. Measured: `createCaptureAgent.capture` re-interprets from the words; only `retry(messageId)` resumes from saved state (`capture-agent.mjs:67-76`). The second run can create duplicate tasks with fresh leased IDs.

Fix: write the outcome in the same mutation as the record push. Derive the push `requestId` from the capture id and attempt. Have the cron call `retry(messageId)` and skip any capture whose draft is `committed`.

## 8. MINOR: shared priority renumbering floods the conflict list

Measured: `saveTask`, `reorder` and `draftSort` renumber `priority` on every sibling in a Block (`planner-state.mjs:109, 121-125, 140-146`). A reorder on each side turns every task in the Block into a "both changed" field. The design writes a conflict record per task (no note). Thirty records for one drag hides real conflicts. The mixed result can also hold duplicate priorities (the `blockTasks` id tiebreak hides that).

Fix: order fields take the newest stamp with no conflict record. Or have each replica renumber the Block after a pull.

## 9. MINOR: Convex and runtime facts

- **`process.env.TZ` per run** (guess): it is process-global. Two concurrent Captures in one Node process can read each other's zone. Pass the zone through the agent's clock and `Intl` instead.
- **Contention** (inferred): `accounts.webLeaseNext`, a per-account `rev` counter and `seededAt` are written by every sync. All replicas then contend on one document. That is fine at this scale, but keep the counter in its own document.
- **Glass keys** (inferred): `<instant>#<n>` renumbers when an equal-instant glass is removed, which turns into a delete plus a create.
- **Undo `yield` policy** (inferred): it is used in Server Capture Undo but missing from the `Change` type.

## 10. Simpler options

- **Stamping in JS** (guess, needs a check): `SyncStamps.java` re-implements `projectRecords` in a second language behind a golden fixture. Every WebView writer already reaches `CompanionStore.write` through a JS bridge `save`. Stamping in one shared JS `save` wrapper keeps one projection. Then Java stamps only `importCopy`, which finding 5 turns into a merge anyway.
- **Server-side repair** (inferred): run the link repair once on the server, not on three replicas. It removes duplicate conflict records and the partial-pull hazard in one move.

## 11. What the landing order cannot prove

- Unit 7 drives a Node stand-in, not the APK. Unit 6 proves "a sync" on the emulator but not phone-offline-then-reconnect. `ci:emulator` has no web sync scenario (brief). Add one emulator scenario: airplane mode, edits on both sides, reconnect, read back with `state`.
- No unit covers:
  - a backup restore
  - a fresh install against a seeded server
  - two tabs
  - a seed larger than one request
  - an edit made during an in-flight request (finding 1)
  - a coupled-field merge (finding 3)
- Clock skew is covered only by the `min(stamp, now)` clamp. A phone clock running slow loses every conflict, and no test states that.
