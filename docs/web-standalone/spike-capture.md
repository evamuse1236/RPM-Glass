# Unit 3: Capture in a Convex Node action

**NOT VERIFIED** for India scheduling while Convex runs in UTC. The existing
pipeline runs and commits, but produces 17:00Z, not the required 11:30Z.
No production deployment was contacted.

## Reproduce

From this worktree, with dependencies installed by `npm ci`, start:

```sh
TZ=UTC CONVEX_AGENT_MODE=anonymous mise exec node@24.22.0 -- npx convex dev
```

Before startup and invocation, checked `.env.local`: refuse `neat-emu-821` or
any non-local deployment, and refuse inherited Convex targeting credentials.
The CLI created `anonymous:anonymous-agent` at `http://127.0.0.1:3212`
(HTTP port 3213); another worktree already used 3210. Functions pushed successfully.

Command:

```sh
npx convex run captureSpike:run '{"text":"call the bank tomorrow at 5pm","timezone":"Asia/Kolkata","now":"2026-10-28T10:00:00+05:30"}'
```

Exact stdout:

```json
{
  "appliedStatus": "applied",
  "draftStatus": "committed",
  "isMainThread": true,
  "lostAckRecovered": true,
  "modelCalls": 1,
  "offsetMinutes": 0,
  "rawKept": true,
  "replayStatus": "applied",
  "tasks": [
    {
      "planned": "2026-10-29T17:00:00.000Z",
      "plannedDate": null,
      "title": "Call the bank"
    }
  ],
  "timezoneBefore": "UTC",
  "timezoneDuring": "UTC",
  "timezoneEnv": "Asia/Kolkata",
  "traceCount": 1
}
```

## Blockers and fixes

- Dependencies were absent: installed the lockfile with `npm ci`. Used pinned
  Convex 1.45.0 for the deployment.
- First push failed: `DeploymentNotConfiguredForNodeActions`, requiring Node
  20, 22 or 24. Shell Node was 26.12.0. Restarted using already-installed
  Node 24.22.0; no system installation or project dependency changes.
- Typechecking found missing shared `.mjs` declarations, Node `process` types,
  and a partial `Storage` implementation. A file-local `@ts-nocheck` keeps this
  disposable probe isolated; no shared typings or tsconfig changes.
- **Unresolved TZ blocker:** assignment changes `process.env.TZ`, but `Intl`
  remains UTC and `getTimezoneOffset()` remains 0 inside the action. A plain
  Node control switches to offset -330. Passing the service `timezone` alone
  does not fix local-Date scheduling. Restored the prior TZ in `finally`.
- No bundling errors: static `node:crypto`, `node:worker_threads`, and the JSON
  fixture import worked. No JSON attributes or dynamic imports were needed;
  no size limit was hit. No shared-code import fixes.
- No missing runtime options after supplying model, changePlanner, editPlan,
  Undo, clock, timezone, unavailable calendar and memory trace storage. Added
  fixture entries/planner to `freshStore()` for version/conversation metadata.
- CLI Node 26 warned about unavailable localStorage; the injected trace sink
  still retained one trace. Convex warned that `/tmp` and generated files were
  on different filesystems; it did not block deployment.

## Unit 6 implications and validation

Use explicit timezone-aware parsing/date arithmetic throughout scheduling;
do not rely on process-global TZ or merely serialize captures per account.
Replace the fake model and untyped boundary with the API adapter and typed
contracts. Persist records, Capture state and receipts atomically with CAS and
stable IDs; an in-memory probe cannot prove process-crash durability.

The backend deliberately throws after saving a committed draft. Repository
reconciliation and recreation of the service followed by same-message retry
retain exactly one new task and one model call. This simulates lost
acknowledgement, not an OS-process crash.

`npm test` and the final `npm run test:js` passed. `check:evidence` fails on
native changes inherited before this spike; this diff changes no app code.
Stopped only this worktree's local Convex after the run.

## Zoned time

**VERIFIED** (unit 3b): the unchanged Capture pipeline, scoped with
`withTimeZone('Asia/Kolkata', ...)`, saves 5 pm India time as 11:30Z inside
an actual local Convex `"use node"` action whose host timezone is UTC.
`process.env.TZ` is no longer assigned by the action. The plain shared runner
is `scripts/web-sync/capture-run.mjs`; it retains the spike's deterministic
model, in-memory backend, lost-ack simulation, retry, raw capture and trace.
It also returns the receipt rendered from the saved draft.

Before startup and invocation, checked that `.env.local` did not name
`neat-emu-821`, targeting was anonymous/local only, and no inherited Convex
targeting variables were present. Started with:

```sh
TZ=UTC CONVEX_AGENT_MODE=anonymous mise exec node@24.22.0 -- npx convex dev
```

The local deployment used `http://127.0.0.1:3212` (HTTP port 3213).
Declined Convex AI-file installation. Command:

```sh
mise exec node@24.22.0 -- npx convex run captureSpike:run '{"text":"call the bank tomorrow at 5pm","timezone":"Asia/Kolkata","now":"2026-10-28T10:00:00+05:30"}'
```

Exact stdout (the space before `PM` in the receipt is U+00A0):

```json
{
  "appliedStatus": "applied",
  "draftStatus": "committed",
  "isMainThread": true,
  "lostAckRecovered": true,
  "modelCalls": 1,
  "offsetMinutes": -330,
  "rawKept": true,
  "receiptText": [
    "Added · Call the bank · Thu 29 Oct, 5:00 PM · Inbox"
  ],
  "replayStatus": "applied",
  "tasks": [
    {
      "planned": "2026-10-29T11:30:00.000Z",
      "plannedDate": null,
      "title": "Call the bank"
    }
  ],
  "timezoneBefore": "UTC",
  "timezoneDuring": "Asia/Calcutta",
  "traceCount": 1
}
```

Verdict: required instant, local day and receipt match native Node started
with `TZ=Asia/Kolkata`. `Asia/Calcutta` is ICU's canonical spelling for this
zone. The original Date/Intl globals are restored after sync returns, async
settlement and exceptions. The local Convex process was stopped after the run;
no production deployment was contacted.

`android-companion/zoned-time.test.mjs` was written first and observed failing
before implementation. Its child-process oracle compares all local getters
and setters, numeric construction and overflow, local ISO construction,
string and locale formatting, explicit timezone overrides, inherited options,
invalid inputs, Date UTC/offset parsing, Intl defaults and resolved options in
Kolkata and New York, each from both UTC and New York hosts. New York covers the 2026 spring gap and autumn overlap.
The pipeline test compares the complete probe result (including title,
planned, plannedDate and receipt text) between native Kolkata and a UTC host
inside the wrapper. It also checks the required instant independently.

The wrapper is pure JavaScript, has no imports or dependencies, and is under
5,000 tokens. Offsets come from explicit-zone Intl per instant. Native Date's
DST disambiguation is retained. **Scope constraint:** globals are temporarily
replaced; independent calls and unrelated Date/Intl work must be serialized.
Nested awaited scopes restore their parent's zone. Previously created Date
objects retain their original prototype; `instanceof Date` remains true.
Phone code does not import or activate this wrapper in this unit.

Validation: 4/4 focused tests on Node 26 and the Convex CLI's Node 24.22.0;
`npm run test:js` passed **1,307/1,307** tests; `npm test` passed those plus
29 rule tests, 42 cloud tests, cloud typecheck, 23 parser/correction checks,
10 native model checks and the app JUnit suite. The final Convex run reproduced
the exact output above after the last code change. No tested method remained
mismatched.
`npm run check:evidence` remains blocked by inherited native changes and an
older debug APK, as in the original spike; native UI behavior is UNVERIFIED.
This unit changes no phone screen behavior and makes no native proof claim.
