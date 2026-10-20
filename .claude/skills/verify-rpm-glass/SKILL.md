---
name: verify-rpm-glass
description: Drive the real RPM Android app (com.rpm.prototype, Capture sheet + Planner WebViews + native widget/settings) on an S24 FE-sized emulator and capture proof. Use before saying any app change is done, to reproduce a reported bug, to screenshot a screen at the phone's One UI default size, or to read what the app actually saved. Ships the `rpmctl` CLI (launch, doctor, seed, open, ui, tap, type, key, scroll, wait, display, shot, eval, state, logs, scenario, check, cleanup).
---

# Verify RPM on a real Android build

RPM is an Android app. Its Capture sheet (`index.html`) and Planner (`planner.html`) are WebViews inside a Java host; the widget, alarms, settings dialogs and "Earlier RPM screens" are native. A desktop browser preview, a green `npm test` or a passing build does not prove a change on the phone. This skill boots an emulator sized like the user's Galaxy S24 FE (1080 × 2340, 450 dpi, Android 16), installs the debug APK built from this checkout, and drives it with real touches.

All commands go through one CLI. Every command prints one JSON object except `ui --brief`; failures print `{"ok":false,"error","fix"}` and exit 1. Read the `fix`.

```bash
RPMCTL="node .claude/skills/verify-rpm-glass/rpmctl.mjs"
$RPMCTL --help            # command list
$RPMCTL <command> --help  # details, options, output shape
```

Run it from the repo root. Needs Node 22+, the Android SDK (`ANDROID_HOME`, or the default `%LOCALAPPDATA%\Android\Sdk`), the AVD `Galaxy_S24_FE_API_36`, a JDK 17+ and `npm ci` done once.

## Launch

```bash
$RPMCTL launch            # reuses the shared warm emulator (boots it if none), builds if needed, installs, opens Capture
export RPMCTL_OWNER=<owner from launch>
```

Ready when it prints `"ok": true` (cold boot about 1-2 minutes, then about 35 s when the emulator is already up). Its `emulator` field says `booted` or `reused the warm emulator`. The emulator runs `-read-only`: nothing a run does persists into the AVD, so differently signed or stale copies of the app are replaced freely. `launch` refuses a port where an emulator it did not start is running. It is idempotent; rerun it after editing Java or the manifest to rebuild and reinstall (`--build` forces a build).

After editing web code only (`android-companion`, `intent-v2`, `chat-prototype`), run `rpmctl sync` instead: it bundles the assets, copies them into the running debug app and reloads the page in about 5 seconds. Screenshots taken after a sync prove the web change for `npm run check:evidence`.

Copy the `owner` from launch into `RPMCTL_OWNER` in the launching agent's shell. In PowerShell use `$env:RPMCTL_OWNER = '<owner from launch>'`. Alternatively pass `--owner <token>` on each mutating command, including `eval`, `scenario`, `cleanup` and a repeated `launch`. A wrong token refuses before any device access. For one compatibility release only, a missing token warns and proceeds. Read-only commands need no token. Keep the token with the launching agent.

### One shared emulator

Every worktree drives the same warm emulator on console port 5580 (`emulator-5580`); only the DevTools port (10000–19999) is per worktree. Two emulators do not fit next to each other in 16 GB, so rpmctl never boots a second one by default.

- **One driver at a time.** A run holds the machine-wide lease from `launch` until `cleanup`. Another worktree's `launch` refuses with `The emulator is busy: <worktree> has driven it since …` and the fix. Add `--wait 900` to queue: it retries every 15 s for up to that many seconds.
- **Each run starts clean.** Taking over the warm emulator wipes the app's data and synced web assets, resets the display to `phone`, then installs this worktree's APK (skipped when the exact APK is already installed). Seed your own data next.
- **Idle runs can be taken over.** Every command marks the run active. A run idle for 20 min (`RPMCTL_IDLE_MINUTES`) loses its lease to the next `launch`, so an agent that forgot `cleanup` cannot block the others.
- **Leases live in `~/.cache/rpmctl-leases`** (Windows: the temp folder; `RPMCTL_LEASE_ROOT` overrides), the same folder whatever `TMPDIR` a shell sets. They reserve the worktree, the console and adb ports and the CDP port. `emulator-5580.json` there records the warm emulator: pid, AVD, boot time and installed APK.
- `--port` and `--cdp-port` still override for a separate emulator and are remembered for the run. Never drive or stop an emulator that rpmctl did not start.

## Doctor

```bash
$RPMCTL doctor
```

Read-only. Answers "is this instance worth driving?": owned emulator alive and booted, display size/density/text scale, installed version equals `app/build.gradle`, installed APK hash equals the local build, the build is newer than the sources, app process up, WebView DevTools reachable, no ANR prompt, no crash since launch. Run it first whenever anything looks off; `firstFix` says what to do.

## Drive

Start from known data, open a surface the way a user does, then act by accessible name:

```bash
$RPMCTL seed                                   # sample plan: 8 Blocks, ~32 tasks, Inbox items, dates relative to now
$RPMCTL open planner                           # Capture -> More -> Planner tile (real taps)
$RPMCTL ui                                     # what is on screen: role, name, state, rect
$RPMCTL ui --brief                             # one line per element: role "name" [state]
$RPMCTL ui --brief --all                       # include elements marked (off-screen)
$RPMCTL tap --role button --name Blocks
$RPMCTL tap --name "RM critical review drafted"
$RPMCTL tap --role combobox --name "Add a task to the Plan"
$RPMCTL type "Email Prof. Rao about the citation format"
$RPMCTL key enter
$RPMCTL wait --role button --name "Email Prof. Rao"
$RPMCTL state files/companion.json            # what the app actually saved
```

- `tap` finds the element in the visible WebView by exact accessible name (then substring), scrolls it into view if needed, and taps its centre with `adb shell input tap`. Ambiguous names fail and list candidates; add `--role` or `--nth`. Native views (system dialogs, permission prompts, legacy screens) use `--native "Text"`.
- `type` commits text to the focused field like an IME (`--adb` for raw key events, ASCII only).
- `display landscape|wide|phone` changes the emulator's size. `phone` is the user's S24 FE at One UI default text (384dp wide, density 450, 100% text). Check every changed screen at `phone`. Larger text sizes are not a target.
- `open widget-capture|widget-voice` sends the intents the home-screen widget's pill and mic send. The widget's planner icon and `PlannerActivity` are not exported, so the planner is only reachable through the app's own UI.
- `eval` is for reading page state. Drive with `tap`/`type`/`key` so the proof follows the user's path.

The feature map in [`features/README.md`](features/README.md) lists every user-facing feature with its entry points, exact handles and the observable end state. A proof of a feature covers the entry points its file lists.

## Evidence

`shot <label>` writes `NN-<label>.png` (device pixels) and `NN-<label>.json` (on-screen elements, activity, URL, display settings) to `.verify/evidence/<run-id>/`. Every mutating command is also appended to `journal.jsonl` there. The folder is gitignored and survives `cleanup`.

Proof standards:

- Exercise the user's path: launcher or widget intent, then taps and typing. No internal setters, no `eval` that changes state, no desktop-browser substitute.
- Capture the action and the result: a shot before and after, not only the final screen.
- Verify side effects: read `state files/companion.json` (or `shared_prefs/...`) after a save, and show the exact stored value.
- Check the changed screen at `phone`: normal text at phone size. Name the display in the shot label. Check larger text only when the change touches text sizing and the user asks for it: `display phone --font-scale 1.3`.
- Run `logs --errors` after a drive; a page error or crash fails the proof even if the screen looks right.
- Model-backed paths (Capture sorting, Jev, Suggest a Purpose) need an OpenRouter key, which the emulator does not have. Without a key, prove the keyless behavior (words saved, "Connect" offered) and mark the model path **UNVERIFIED**.
- The emulator is not Samsung One UI. Samsung keyboard, battery limits, audible alarms and real launcher widget placement stay **UNVERIFIED** until checked on the phone.

Reply with the evidence paths (`.verify/evidence/<run-id>/NN-*.png`).

## Match the check to the change

| Change | Proof before saying done | Enforced by |
|---|---|---|
| Web only (`android-companion`, `chat-prototype`, `intent-v2`) | A browser screenshot of the changed screen, then `rpmctl sync` on the warm emulator and `rpmctl shot`. No APK build. | `npm run check:evidence` (`require-evidence.mjs`, Stop hook) accepts a shot whose web hash matches the bundle |
| Native (Java, notch, manifest, `cli`) | `rpmctl launch --build`, then drive the changed feature and `rpmctl shot` it. | `npm run check:evidence` needs an APK newer than the change and a shot with it installed |
| Merging app changes into main | One passing `rpmctl scenario --all` on the merged commit, not after each change. | `npm run check:merge`; `npm run hooks:install` makes it a `pre-merge-commit` hook |

`scenario` refuses to run on a stale app: an APK older than native code, a different APK than this checkout built, or web code newer than the last install or `sync`. `--allow-stale` overrides and is recorded.

## Regression scenarios and checks

```bash
$RPMCTL scenario --list       # device scenarios that encode past corrections
$RPMCTL scenario --all        # run them on the owned emulator (seeds its own data)
$RPMCTL check                 # npm test + npm run check:rules, logs into the evidence folder
```

The rule table in `AGENTS.md` names which scenario or check enforces each rule.

`npm test` checks literal role/name lookups in rpmctl and scenarios against the app's web source before a device run. Failures identify the call to update. Matching uses name substrings, as the driver does; roles beyond button/textbox must be set in the same source file. Keep saved-data titles dynamic, read from `state`, rather than treating seeded words as app labels. This source check cannot prove runtime visibility or accessibility wiring.

## Cleanup

```bash
$RPMCTL cleanup
```

Ends your run: removes the DevTools port forward and `.verify/state.json`, releases the lease and keeps the emulator warm for the next run. A detached watcher stops the warm emulator after 20 min with no run, so it does not sit on the machine's memory. Evidence stays; the output names the folder. Run `cleanup` after a failed attempt too.

`cleanup --stop` also stops the emulator now (by its recorded pid, never by name). `cleanup --keep-emulator` retains the state and lease for the same owner to resume.

## A physical phone

`--serial <adb-serial>` points `doctor`, `ui`, `shot`, `logs` and `state` at another device read-only (for example the S24 FE over wireless debugging). Every command that changes a device refuses any device `rpmctl` did not launch. Installing on the phone is a release step: follow `docs/testing.md` and the release rule in `AGENTS.md`, and only when the user asked for it.

## Gotchas

- The software-rendered emulator sometimes raises "System UI isn't responding". `launch` answers Wait; mid-run, `tap --native Wait`.
- The Capture sheet auto-closes 6 s after a receipt unless touched; the planner snackbar times out after 6 s (4 s without Undo). Wait for the element, not a fixed sleep.
- A WebView element hidden behind the bottom nav bar or the keyboard still has a rect; `ui` reports it as on screen. Look at the screenshot.
- `tap` uses `scrollIntoView` to bring an off-screen element into view. When scrolling itself is under test, use `scroll down|up` (a real swipe) first.
- Sample data dates are relative to the moment you run `seed`; reseed on a new day.
