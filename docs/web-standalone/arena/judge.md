# Verdict: use candidate 2

Reviewed the brief and both candidates end to end, then checked deciding claims against this checkout. Candidate references below mean `/home/dararch/.cache/arena-standalone/candidate-{1,2}/design.md`; code paths are relative to `/home/dararch/.t3/worktrees/RPM-Glass/feat-web-standalone`. These are design scores, not implementation approval.

| Rubric criterion | Candidate 1 | Candidate 2 |
|---|---|---|
| 1. Must-keeps | **2/5** — Words-first storage is concrete, but silent priority loss, unsafe retries and incomplete Undo contradict no-loss promises. | **4/5** — Durable recovery, guarded inverses and words-first jobs cover the requirements; review-history round trips need clarification. |
| 2. Complete phone hook | **4/5** — Hooks both write and import and diffs state, but does not protect replica metadata during restore or distinguish remote writes. | **5/5** — Hooks the shared persistence funnel, preserves trusted metadata through import, and distinguishes remote application. |
| 3. Merge correctness | **2/5** — Integer alarms are respected, but tombstones, ID reuse, duplicate logs, ordering and retry/Undo interactions remain wrong. | **4/5** — Revision guards, persistent allocators, atomic batches and recovery-backed repairs are sound; derived history and capacity need proof. |
| 4. Surface size | **4/5** — One record exchange and explicit deletion list; field clocks, leases and snapshot rebasing make the apparent simplicity misleading. | **4/5** — One versioned transaction owner, explicit legacy deletion and small UI adapters; multiple request variants are justified, but the journal/recovery machinery is substantial. |
| 5. Server Capture | **2/5** — Node reuse and durable raw text are useful, but the shown service cannot initialize and state/receipt atomicity is underspecified. | **5/5** — Supplies required adapters, conversation CAS, job fencing, timezone handling, answer/retry paths, revocation and guarded Undo. |
| 6. Buildability/proof | **3/5** — Checked landing units and offline/conflict drives exist; fake AI is explicitly insufficient and correctness gaps add redesign. | **3/5** — Stronger crash/migration/emulator/real-AI proof, but replacing three Undo paths and adding recovery, journals and migration is an optimistic several-day estimate. |
| Total | **17/30** | **25/30** |

## Candidate 1: errors and loss cases

1. **Retry is not idempotent.** C1:166,194–205 ignores intervening revisions when values happen to match the old base. Example: A→B saves, its reply is lost, another writer restores A, then the old retry takes B because `server == base`, silently overwriting the newer A. Repeated conflicts can also append duplicate notes. Existing `convex/planner.ts:122–129` binds request identity to one durable result; `intent-v2/src/repository.mjs:15–36` similarly preserves receipts across uncertain saves. Keep this guarantee.

2. **Tombstones break Undo; allocation can reuse deleted identities.** C1:196 makes deletion permanent, while C1:286 promises restoring snapshots. Undo of `removeEntity` must recreate the same Block ID (`android-companion/planner-state.mjs:44–49,75–81`). Undo of task creation removes the task and clears the image; C1's current/Undo maximum can then allocate that ID again against its retained tombstone. Current reducer execution confirmed both same-ID Block restoration and task ID reuse after Undo. Use explicit guarded resurrection and durable counters.

3. **Snapshot rebasing misses remote ABA changes.** C1:286 copies only differences between sent and merged values. If local A→B and remote B→C→B occur before pull, no difference is copied; old Undo still restores A over the remote B. The three existing restoration paths are `planner-state.mjs:44–49`, `chat-prototype/companion-tools.mjs:138–142`, and `intent-v2/adapters/rpm-glass.mjs:58–63`. Values alone cannot establish whether an Undo remains valid.

4. **Set merge loses actual glasses and can duplicate occurrence receipts.** C1:201,281 treats logs as sets. `android-companion/planner-body.mjs:8–12` deliberately records multiple glasses at the identical timestamp; an in-memory two-glass call produced two equal strings. Set union reduces that to one. Recurring completions are `{occurrence,completed}` objects (`planner-recurrence.mjs:23–32`): two devices completing the same occurrence at different times can produce two receipts rather than one coherent completion.

5. **Some losers are deliberately discarded.** C1:104,204–205,281 omits recovery for priority/color conflicts. Priority is persisted plan order (`PRODUCT.md`, Data and compatibility; `planner-state.mjs:109–125`), so this violates the losing-value requirement. Record-wide phone timestamps also let an unrelated later edit elevate an older field; “newer detail wins” is not what that clock measures.

6. **Repairs are destructive and incomplete.** C1:289 clears links without retaining their prior values, omits week verdict cleanup (`planner-review-data.mjs:53–56`) and missing-routine runs (`body-store.mjs:239`). Record chunks can expose children before parents, triggering premature unlinking. Independent field merges can also combine recurrence with a cleared schedule, an invariant enforced on edits at `planner-state.mjs:98–103` but not by `validatePlanner:18–29`. Repairs belong in an atomic validated server commit with recovery.

7. **List order has no representation.** C1's record map lacks ordered collection records. Concurrent entity additions append in opposite orders on the replicas; `saveEntity` appends and `arrangement` consumes Block array order (`planner-state.mjs:74,165`). Record-value convergence alone does not preserve this state.

8. **Restore and stamp publication are unsafe as specified.** `CompanionStore.java:33–38` replaces the imported document; C1:264 adds stamping but never preserves the current base/cursor/lease over backup metadata. Its separate stamps are also written before AtomicFile success, and remote applications pass through the same stamping hook. Covering every writer is insufficient without distinguishing successful local edits from remote installation and failed writes (`CompanionStore.java:31–32`).

9. **Capture initialization, scheduling and storage need correction.** C1:74 omits mandatory `undo` and `readCalendar`; `intent-service.mjs:67–70` throws before capture starts. It also transmits no user timezone: the service defaults to the server's timezone, so relative dates/clocks can be interpreted incorrectly for India (`intent-service.mjs:68`, `intent-v2/src/harness.mjs:31`). A single growing `captureState.intent` document and unbounded applied before/after arrays have no byte/chunk policy. Convex documents must remain below 1 MB; count-only exchange limits do not enforce transaction budgets. See [Convex types](https://docs.convex.dev/database/types) and [limits](https://docs.convex.dev/production/state/limits). Node actions are appropriate; that does not solve durable CAS and receipt publication.

10. **Cutover can duplicate or discard pending intent.** C1:299–302 rejects leftovers, blindly replays old plan operations, then deletes legacy storage without reconciling an applied-but-unacknowledged request. That can create a task twice. It also neglects held operations stored separately under `rpm.web.plan.v1` (`web/app/plan-queue.mjs:6,169–181`), not just `rpm.web.v1`. Candidate 2's disposition-based migration is safer.

## Candidate 2: remaining corrections and limits

- **Derived review history needs explicit preservation.** The current projector regenerates `reviewActivityDays` solely from private revisions (`web-sync-snapshot.mjs:56–59`); weekly review consumes that field (`review-state.mjs:75–84`). C2's reused projection must union retained imported summaries with locally derived days, or remote activity disappears on re-projection. C1:114 explicitly declines to store it and has the same defect more directly. Require a remote completion/reopen/history round-trip test.
- **Capacity safety is not established by splitting journal parts.** C2:110 bounds bytes, but must also bound individual records, scanned/written documents and index reads, including recovery and inverses. Current schema collections allow 10,000 items (`web/contract/snapshot.schema.json`); [Convex limits](https://docs.convex.dev/production/state/limits) include transaction count limits. Rejecting safely preserves data but may block activation or ordinary saves. Prove representative maximum stores before promising the delivery estimate. No unavoidable silent-loss case was found in C2's stated guarded commit/recovery algorithm.

## Recommendation and grafts

Use **candidate 2**, retaining its durable request receipts, guarded Undo, persistent odd/even allocator and staged migration. Both candidates correctly avoid new alarm aliases by bounding IDs: `CompanionAlerts.java:27–29,88` uses URI identity, modulo request codes and integer notification IDs.

Graft two parts of candidate 1: its explicit per-kind projection/apply/repair interface with a shared Java/JS golden fixture; and its early local-Convex Node Capture bundling spike, before committing to the larger server implementation. Do not graft its merge clocks or Undo rebasing.

Only this verdict was written. No repository edits, full test suite, emulator runs, deployments or model calls were performed.
