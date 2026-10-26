# Unit 6a: durable server Capture

Implemented from `5d42356` on `build/u6a-capture`. No production deployment or phone was contacted.

Capture saves exact words and its public summary before scheduling the Node action.
The worker uses the existing agent, model policy, Anthropic transport and explicit
`withTimeZone` scope. Account claims serialize conversations; attempts fence late
workers. Planner cursor and per-item state versions protect every atomic save.
Records, server stamps, accumulated inverse, state items, capture outcome and browser
receipt are committed together. Interpreted drafts resume without another model call.

Receipt text is rendered in the Node action's timezone scope and passed into the
atomic mutation. A separate Convex mutation runs in UTC; rendering there produced
11:30 AM for a task correctly saved at 5 PM India time. The final implementation
and a regression test cover that separate-runtime boundary.

The cron retries saved rows with no live claim every five minutes, up to three
attempts. Capture Undo uses the website's group-preserving inverse rule. Snapshots
combine phone and server captures, newest last, capped at 50, with an optional
question field. `args.timezone` defaults to Asia/Kolkata; the existing top-level
`timezone` remains accepted for compatibility.

## Validation

`npm test` passed after the final implementation:

- 1,363 JavaScript tests.
- 30 rule tests.
- 81 cloud tests, including 18 server Capture tests with a fake model.
- Root cloud typecheck and the separate Convex-directory typecheck.
- 23 parser/correction checks, 10 native model checks, and 176 app JUnit tests
  across 27 suites (zero failures).

Cloud tests cover exact words before the first model call, India scheduling,
lost save replies, worker death before apply, same-message retry, failures,
missing keys, deadlines, clarification continuation, later-edit-preserving Undo,
parallel claims/runs, stale leases, planner and per-item CAS, concurrent website
edits, snapshot limits, retry exhaustion, and UTC mutation receipt rendering.

For normal local startup, `plannerProtocol.ts` now uses the same JSON import
attributes as the shared modules. Mixed attributed/unattributed imports caused
Convex 1.45's bundler to stat a nonexistent path ending in
`with { type: 'json' }`. `convex/tsconfig.json` now matches the root typecheck's
`allowJs: false`, so shared JavaScript imports retain their explicit untyped
boundaries rather than triggering a second, incompatible inferred typecheck.
No installed dependency patch remains. The snapshot schema shares its repeated
integer and ID rules to keep every changed file below 5,000 tokenizer tokens.

## Live local result

Started an anonymous local Convex under Node 24.22.0, host TZ UTC, using ports
3212/3213. Refused production targeting before startup and key setup. Set the
Anthropic key through the vault wrapper without printing it, paired a disposable
fixture phone, and pushed `web/fixtures/snapshot.json` through
`POST /v1/planner/push`. Linked a web token and submitted through
`POST /v1/web/commands`:

```json
{"type":"capture","args":{"text":"call the bank tomorrow at 5pm","timezone":"Asia/Kolkata"}}
```

The HTTP command changed from `pending` to `applied`. Resulting task excerpt:

```json
{
  "id": 1000000000,
  "title": "Call the bank",
  "raw": "call the bank tomorrow at 5pm",
  "planned": "2026-10-28T11:30:00.000Z",
  "plannedDate": null
}
```

Receipt: `Added · Call the bank · Wed 28 Oct, 5:00 PM · Inbox · reminder`.
The live clock was 2026-10-27 in India; the fixed-clock cloud test separately
asserts 2026-10-29T11:30:00.000Z when now is 2026-10-28 at 10 AM India.
Full task and result JSON remain under
`.verify/evidence/u6a-server-capture/{task,result}.json`.

Removed ANTHROPIC_API_KEY and confirmed the local deployment had no environment
variables. Stopped its backend, checked port 3212 was closed, and removed its
disposable database/configuration (also retiring an instance credential exposed
by a process diagnostic). `rpmctl cleanup` confirmed nothing was running for this
worktree.

No requested Server Capture rule remains unimplemented. Native UI, real widget
placement and Samsung behavior are UNVERIFIED: this unit changes no app files.
`npm run check:evidence` is blocked by inherited native changes and an older APK,
as already recorded for the spike; it does not provide native proof for this unit.
