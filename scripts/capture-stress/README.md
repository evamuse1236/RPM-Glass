# Stress-test Capture rambles

The target checkout needs its dependencies installed, for example with `npm ci` in that checkout. The runner never reads app key files. Strict custom-prompt-only isolation is UNVERIFIED because CLI runtime instructions can remain even with safe mode. The canary check covers project documents and hooks; it does not certify that all other instructions are absent. `isolation.json` retains the model's report of foreign instructions.

After improving an expectation, recheck retained outputs without making model calls with `node scripts/capture-stress/recheck.mjs .verify/capture-stress/RUN-DIRECTORY`. It preserves the previous results and an evaluation history. It refuses changed case words or turn order. `blockWords` checks that a task belongs under the named Result. `focusRetained` checks surviving proposal IDs; removal checks also require every survivor's fields to remain unchanged. Task insertion may renumber priorities, so unsolicited order checks compare relative order among seeded tasks.

Run from this checkout with an authenticated Claude CLI on PATH.

```powershell
npm run stress:capture
npm run stress:capture -- --hardest --repeat 3
npm run stress:capture -- --repo C:\Repos\rpm\OTHER-WORKTREE --concurrency 3
npm run stress:capture -- --only dinner-exact-four-turns,monologue-loan --repeat 3 --judge
```

The corpus and checkers come from this checkout. `--repo` selects the entire target app implementation, including its prompt, schema, service, harness, model policy, interpreter, time guards, planner adapter and seed generator. It does not alter either checkout. No emulator, phone or app key file is used. `--help` lists all options. A failed expectation exits 1; a runner failure exits 2. Each run uses a new `.verify/capture-stress/<run-id>` directory unless `--out` is supplied. Use a new output directory each time.

The runner first probes isolation with a parent `CLAUDE.md` canary, hook canaries and a custom system nonce. It starts Claude in an empty temporary directory, with tools, MCP, skills and persistence disabled. `--bare` is attempted first. In Claude CLI 2.1.303 it disables OAuth and returns “Not logged in” on this machine. The runner then uses the existing login with `--safe-mode --restricted --setting-sources ""`. These flags disable project customizations and hooks. The CLI's own `StructuredOutput` formatting tool remains available. The probe records that distinction and stops the run if foreign instructions or a hook are observed. It cannot inspect hidden provider instructions.

Each case/repeat owns a file-backed, versioned store. The fixture reuses `scripts/gauntlet/seed.mjs`, which rpmctl uses, and replaces its tasks with six stable targets. The dentist is a read-only calendar fixture. Water, meals, Result groups and two drafts are seeded. The product clock starts at Monday 19 October 2026, 10 am IST, and advances one second per turn. System latency uses a separate wall clock.

`createIntentService` and `createCaptureAgent` drive the real application backend. The injected model sends the target's production prompt, JSON schema and exact harness input to the CLI. No new app seam or behavior is added. Production route selection, deadlines and repair/escalation remain active. CLI startup, extra formatting turns, caching and thinking can differ from the phone's API call. This is named **CLI transport** in every report. Native API transport, provider fallback, notification delivery and UI remain UNVERIFIED.

`rambles.json` lists the split corpus and the ten hardest case IDs. Each case has `turns` and `expect`. A turn has `text`, optional `focus` (`dinner` or `previous`), and optional `deferApply`. Ordinary turns auto-apply through the Capture agent. Deferred turns explicitly exercise the draft stage through the same service and harness. A focused draft must remain active; the runner does not revive a committed draft.

Expectations describe canonical saved state by default. `created` matches title words by exact token or prefix and can require an entity, local `day`/`time`, `purposeWords`, `must` or `alert`. All words must match, and each expected item consumes a different row. `forbidden` rejects retracted titles in saved rows and pending proposals. `maxNew` counts new active tasks and planning entities. `changes` checks existing target IDs and fields; every other seeded item must retain its meaningful fields. `unchanged` gives explicit focus controls. `focusRemoved` checks operation IDs in the effective focused draft. `health` checks actual water and meal records. `question` is allowed, required or forbidden. Optional `checkpoints` run the same assertions at a numbered turn. `scope: "draft"` explicitly checks pending proposals instead of saved rows.

Execution checks cover schema validation, durable exact words before model work and after later turns, crashes, raw script faults, application failures and repeated questions. `npm test` includes negative controls and an injected model test that exercises real persistence, interpretation, canonical application and `userMessage` fault handling without calling a model. Rule checks cover the production error formatter's use. A safe backend error is still an evaluation failure if interpretation or application failed.

Every case directory contains the seed, current/final store, per-turn inputs, model outputs, traces and assertions. `results.json` and `report.md` aggregate pass rates, overlapping failure classes, routes, latency and CLI usage. Token fields retain uncached input, output and cache counts separately. Dollar figures are the CLI's list-price estimates, not billing receipts. A killed process may report no usage; do not interpret missing usage as free. An optional isolated Sonnet judge scores meaning without changing deterministic verdicts. Fuzzy mismatches still need inspection before treating the overall rate as a product-quality estimate.
