# Phone sync wire contract

Shared by unit 2 (Convex) and unit 4 (phone replica). `design.md` gives the reasons; this file gives the exact shapes. Types use `web/contract/records.mjs` keys and `merge.mjs` stamps.

```ts
type Key = string;                       // records.mjs recordKey(kind, raw), for example "task:42"
type Value = Record<string, unknown>;    // projectRecords value
type Stamps = Record<string, string>;    // group -> ISO instant
type Change = {key: Key; baseRev: number | null; base: Value | null; value: Value | null; stamps: Stamps};
type Row = {key: Key; rev: number; value: Value | null};   // value null = tombstone
```

Both routes use the phone's device token (`Authorization: Bearer <64 hex>`), the existing `phoneAuth`, quota and 1 MB body limit.

## POST /v1/planner/push

Request `{seq, part, final, changes}`: `seq` is a positive integer that grows by one per frozen outbox. `part` counts from 0. At most 200 changes and 800 KB per part. Changes come in dependency order: area, goal, project, block, then all other kinds.

Server, in one mutation per part:
1. If `seq < phoneSync.lastSeq`, or `seq === lastSeq` and this part already has a stored receipt, return that stored receipt and change nothing. Receipts are kept for the latest seq only.
2. Merge each change with `mergeChange(row, change, now)`. Write each changed row with a new rev from `accounts.cursor`. Write each conflict as a `conflict:<uuid>` row.
3. Load the store, run `repairLinks` against tombstones, then `validatePlanner`. A record that makes it fail keeps its previous server value and the phone value becomes a conflict row.
4. On `final: true`, set `accounts.seededAt` if it is unset.
5. Store and return the receipt `{seq, part, results: Row[]}` with one row per pushed key (its value after the merge and repair).

## POST /v1/planner/pull

Request `{after, limit}` with `limit` at most 500. Reply `{rows: Row[], cursor, hasMore, seededAt}`: rows with `rev > after` in rev order, up to `limit` rows or 4 MB. `cursor` is the last row's rev (or `after` when empty). The phone stages every page and applies nothing until `hasMore` is false.

## Errors

The same `{error: {code, message}}` shapes and statuses as today: 400 invalid, 401 credentials, 409 `seq_conflict` (a part for an older seq that has no stored receipt), 413 too large, 429 with `Retry-After`, 503. The old `/v1/planner/sync` route returns 410 `upgrade_required`.
