# RPM

RPM is Dara's personal Android planning app (`com.rpm.prototype`): a Java host with two WebViews, Capture (`android-companion/index.html`) and the Planner (`planner.html`), plus a native home-screen widget, alarms and settings. Capture keeps the user's words first; an optional OpenRouter model drafts tasks that the user reviews and saves.

For planning behavior, read `CONTEXT.md` and the relevant part of `PRODUCT.md`. Capture, task, result, purpose, must, priority, and calendar commitment have distinct meanings. Preserve the user's original words and recovery/Undo. Completing actions does not by itself establish that a result was achieved.

For UI work, use `DESIGN.md` and the relevant surface contract under `docs/`; validate the named widget or screen at phone size and enlarged text. A build or web preview alone does not verify a native widget.

`/home/darax/Codex Projects/RPM Agent` is the separate Arden coaching project. Its course study and `docs/rpm-widget-recommendations.md` can inform requested product decisions; recommendations are not already-implemented app features. Keep Arden's persona and memory local to that project.

For a Google Tasks batch, read the installed `tasks` skill and preserve its batch/item ledger. A mock-only integration remains unfinished unless accepted as the requested scope. `docs/rpm-deferred-features.md` is a backlog, not authorization to activate features.

For an authorized phone release, compare the working tree, branch, and installed build so the release preserves newer features and unrelated work. Follow `docs/testing.md` and relevant phone setup guidance. Verify package/version, compatible signing, preserved app data, and actual launch. Report commit/push, APK build, device installation, and external integration activation separately.

## Commands

Every command works from PowerShell, cmd and Git Bash. Run them from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | `npm ci`, Playwright Chromium, `.env.local` from `.env.example`, builds the WebView assets, then checks Node 22+, a JDK 17+ (21 works) and the Android SDK (platform 36, build-tools 36.0.0). Exits 1 naming each missing piece. |
| `npm test` | The fast suite, same as CI: `test:js` (node:test), `check:rules`, `test:cloud` (vitest), `typecheck:cloud` (tsc), `test:java`. About 1 minute. |
| `npm run dev` | Serves the Planner and Capture in a desktop browser with a fake Android bridge and sample data: `http://localhost:4173/planner.html` (`-- --port N` to change). No model, no Convex. |
| `npm run verify` | The gate before "done": `npm test`, `npm run build:android` (debug APK + lint), `npm run preview:drive` (ticks a task at 390x844 and 1440x900), `npm run check:evidence`. About 3 minutes once Gradle is warm. |
| `node .claude/skills/verify-rpm-glass/rpmctl.mjs` | Drives the real Android app. Read the `verify-rpm-glass` skill first. |

`npm run dev:cloud` and `npm run deploy:cloud` talk to a real Convex deployment. Run them only when the user asks.

## Where things live

The folder table is in `README.md` ("Where things live"). Tests sit beside their source: `android-companion/*.test.mjs`, `cli/*.test.mjs`, `chat-prototype/*.test.mjs`, `intent-v2/test/`, `cloud-tests/` (Convex), `tests/*.java` (plain-JVM host tests), `app/src/androidTest/` (on-device, not in `npm test`). Repo checks live in `scripts/rules/` and `scripts/agent/`; toolchain lookup (JDK, SDK, npm) in `scripts/lib/toolchain.mjs`.

## Words

Product words (Task, RPM block, Project, Life area, Must, Priority, Calendar commitment, Planning draft) are defined in `CONTEXT.md`. Code words not there:

- **Capture**: the quick-entry sheet and the act of keeping a thought verbatim. **Receipt** and **Undo**: what Capture shows after a save, and the way back.
- **Result** and **Purpose**: a Block's desired outcome (optionally with a due date) and the user's reason for it. **Area**: a life area; its hue colors the planner.
- **Inbox**: tasks with no Block yet.
- **Draft** / **proposal**: model output (`rpm_intent_v1`, `intent-v2/prompts/intent-system.mjs`) waiting for the user's Save. Only Save writes the plan.
- **Earlier RPM screens** / **legacy store**: the old native screens and their SQLite store (`rpm-offline.db`). The widget still writes there; `legacy-import.mjs` copies entries into the companion store.
- **Outbox**: the durable upload queue for the legacy Convex sync.
- **Gauntlet**: the browser screenshot harness in `scripts/gauntlet/`. `npm run dev` serves it.
- **rpmctl**: the Android driver CLI in the `verify-rpm-glass` skill.

## Before you say done

1. Run `npm run verify`. CI runs `npm test` only.
2. If app code changed (`app/src/main`, `android-companion`, `chat-prototype`, `intent-v2`, `cli`), drive the changed feature on the real app with the `verify-rpm-glass` skill: `node .claude/skills/verify-rpm-glass/rpmctl.mjs launch` (`rpmctl` below), then the recipe in its `features/` file. Inside T3 Code, open the emulator in the Device panel instead of `rpmctl launch` (see the skill). Check it at `display phone` and `display large-text` (and `max-text` if text can wrap), read back what was saved with `state`, and run `logs --errors`.
3. Run `rpmctl scenario --all` when the change touches the planner, Capture or layout. Every scenario must pass or be a recorded known bug.
4. Put the evidence paths (`.verify/evidence/<run-id>/NN-*.png`) in the reply. Mark anything you could not drive (model-backed paths, Samsung-only behavior, the real home-screen widget) **UNVERIFIED**.
5. `npm run check:evidence` must pass. In Claude Code the Stop hook runs it for you.
6. Run `rpmctl cleanup` when you finish. Evidence stays.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| An error reaches the screen only through `userMessage(error)`, never as raw script text. | `npm run check:rules` (`raw-error-text`), `android-companion/user-message.test.mjs`, and the scenario runner's raw-error guard |
| A change updates the screen in place: existing rows are kept, the field keeps focus, the new item appears once and is saved where it belongs. | `rpmctl scenario plan-add-in-place`, `android-companion/surface-refresh.test.mjs` |
| The field you are typing in is never covered by the keyboard, nav bar, snackbar or FAB. | `rpmctl scenario focused-field-visible` (known bug recorded, expires 2026-11-07) |
| At 200% text no title or action label is cut, and nav labels stay visible. | `rpmctl scenario max-text-reflow` (one exception pending approval) |
| Capture saves the user's exact words before anything else, with or without an AI key. | `rpmctl scenario capture-keeps-words`, `android-companion/capture-session.test.mjs`, `chat-prototype/composer.test.mjs` |
| Dates are honest and compact ("2:30 pm to 3 pm", "Time not set"). | `android-companion/capture-content.test.mjs` |
| Legacy entries survive Undo, races and re-runs of the import; a signing mismatch is never a reason to discard data. | `android-companion/legacy-import.test.mjs` ("undoing an earlier planner change keeps the copied entries" fails on the code before 8f6f2a3); release side: `rpmctl doctor --serial` signer checks |
| A reply beside an unsaved draft never claims a write ("added", "scheduled", "saved"). | `intent-v2/test/reply-claims.test.mjs` (app-written replies and the prompt's no-write sentences). Model replies in plan/query mode reach the screen unchecked: written only |
| A CSS comment never contains `*/` (it ends the comment and silently drops the next rule, as with the Google Sans Flex font in a5352a5). | `npm run check:rules` (`css-comment-close`) |
| npm scripts run from PowerShell, cmd and Git Bash: no `bash` or `.sh` in `package.json` scripts. | `npm run check:rules` (`bash-in-npm-script`) |
| "Done" needs proof from the real app: a build and a screenshot newer than the change. | `scripts/agent/require-evidence.mjs` (Stop hook in `.claude/settings.json`, `npm run check:evidence`) |
| A phone release updates the installed app in place: same signing key, and the build matches this checkout. | `rpmctl doctor --serial <phone>` (`installed-signer-matches-local`, `installed-apk-matches-local-build`, `installed-version`) |
| Never drive or change a device the tooling did not start. | `rpmctl` refuses mutating commands on any device but its own read-only emulator |
| Checks run green on a Windows checkout. | `.gitattributes` (LF checkout), the win32 guards in the file-mode tests, Node-only npm scripts (`bash-in-npm-script`) |
| Model-backed paths without a key, Samsung behavior and real widget placement are reported as UNVERIFIED, not as passing. | Judgment: `verify-rpm-glass` SKILL.md proof standards |

Add a rule here when the user corrects you, with the check that enforces it. A new source-text check goes in `scripts/rules/check-rules.mjs` with a test in `check-rules.test.mjs`; replay it on the old tree with `node scripts/rules/check-rules.mjs --root <dir>` to show it fails on the real mistake.

## Known failures

- `assembleDebugAndroidTest` does not compile: `app/src/androidTest/java/com/rpm/prototype/OfflineTests.java:59` checks widget ids `R.id.checkin` and `R.id.remind`, which 26be532 (widget capture bar) removed. `npm run build:android` skips it by name and says so; `npm run build:android -- assembleDebugAndroidTest` runs it.
- `cli/openrouter.test.mjs` "private key file is parsed as data and never executed" is skipped on Windows: `readApiKey` needs POSIX file modes, so `--key-file` always refuses there.
- `npm run chat` crashes in PowerShell ("The \"path\" argument must be of type string") when neither `HOME` nor `XDG_DATA_HOME` is set, even with `--data`: `chat-prototype/companion-server.mjs` joins `process.env.HOME`. Set `$env:HOME = $env:USERPROFILE` first.

## Gotchas

- From PowerShell, `bash` is usually WSL's (no JDK, no Node). Write repo scripts in Node.
- npm 12 blocks esbuild's postinstall. The bundle still builds (`npm run build:android-assets`); ignore the warning.
- The Device panel, not a shell, opens Android emulators in T3. A sub-agent has no Device panel; mark its Android drive UNVERIFIED.
- `README.md` "Delivering updates" sends release APKs to a WhatsApp group. That is a release step: do it only when the user asks for a release.
