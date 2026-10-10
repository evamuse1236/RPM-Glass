---
name: verify-rpm-glass
description: Drive the real RPM Android app (com.rpm.prototype, Capture sheet + Planner WebViews + native widget/settings) on an S24 FE-sized emulator and capture proof. Use before saying any app change is done, to reproduce a reported bug, to screenshot a screen at phone size or enlarged text, or to read what the app actually saved. Ships the `rpmctl` CLI (launch, doctor, seed, open, ui, tap, type, key, scroll, wait, display, shot, eval, state, logs, scenario, check, cleanup).
---

# Verify RPM on a real Android build

RPM is an Android app. Its Capture sheet (`index.html`) and Planner (`planner.html`) are WebViews inside a Java host; the widget, alarms, settings dialogs and "Earlier RPM screens" are native. A desktop browser preview, a green `npm test` or a passing build does not prove a change on the phone. This skill boots an emulator sized like the user's Galaxy S24 FE (1080 × 2340, 450 dpi, Android 16), installs the debug APK built from this checkout, and drives it with real touches.

All commands go through one CLI. Every command prints one JSON object; failures print `{"ok":false,"error","fix"}` and exit 1. Read the `fix`.

```bash
RPMCTL="node .claude/skills/verify-rpm-glass/rpmctl.mjs"
$RPMCTL --help            # command list
$RPMCTL <command> --help  # details, options, output shape
```

Run it from the repo root. Needs Node 22+, the Android SDK (`ANDROID_HOME`, or the default `%LOCALAPPDATA%\Android\Sdk`), the AVD `Galaxy_S24_FE_API_36`, a JDK 17+ and `npm ci` done once.

## Inside T3 Code

The operator watches Android devices in T3's Device panel, so in T3 do not run `rpmctl launch` (it boots an emulator from the shell, where nobody can see it). Open `Galaxy_S24_FE_API_36` with `device_list` then `device_open`, and install with `adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk`. `rpmctl` refuses mutating commands on a device it did not launch, so on that device use `doctor`, `ui`, `shot`, `logs` and `state` with `--serial <serial>` and drive with the CLI `device_open` returns. If no device can be opened (a sub-agent has no Device panel), mark the Android drive **UNVERIFIED**. Never install on or drive the physical phone unless the user asked for a release.

If `adb install -r` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed copy is signed with another key. Never uninstall it without the owner: that wipes the app's data. Drive the installed build read-only (`rpmctl ui`, `doctor`, `shot` with `--serial`) and say in the reply that the build under test was not installed, or ask the owner. `doctor` then reports a different build; that is expected.

## Browser preview (a smoke check, not phone proof)

```bash
npm run preview:drive   # serves the planner, ticks "Group call: merge sections" at 390x844 and 1440x900, reads the store back
npm run dev             # the same preview for manual driving: http://localhost:4173/planner.html
```

Screenshots and `result.json` go to `.verify/preview/<time>/`. The preview uses a stand-in for the Android bridge and sample data, so it catches broken bundles, page errors and planner logic quickly. It does not prove the WebView, text zoom, keyboard or native screens; that needs the Android drive below. `npm run verify` runs it.

## Launch

```bash
$RPMCTL launch            # boots emulator-5580 headless, builds the APK if sources changed, installs, opens Capture
```

Ready when it prints `"ok": true` (cold boot about 1-2 minutes, then about 35 s when the emulator is already up). The emulator runs `-read-only`: nothing a run does persists into the AVD, so differently signed or stale copies of the app are replaced freely. `launch` refuses a port where an emulator it did not start is running. It is idempotent; rerun it after editing app sources to rebuild and reinstall (`--build` forces a build).

## Doctor

```bash
$RPMCTL doctor
```

Read-only. Answers "is this instance worth driving?": owned emulator alive and booted, display size/density/text scale, installed version equals `app/build.gradle`, installed APK hash equals the local build, the build is newer than the sources, app process up, WebView DevTools reachable, no ANR prompt, no crash since launch. Run it first whenever anything looks off; `firstFix` says what to do.

## Drive

Start from known data, open a surface the way a user does, then act by accessible name:

```bash
$RPMCTL seed                                   # sample plan: 8 Blocks, ~32 tasks, Inbox items, dates relative to now
$RPMCTL open planner                           # Capture -> More -> Open planner (real taps)
$RPMCTL ui                                     # what is on screen: role, name, state, rect
$RPMCTL tap --role button --name Blocks
$RPMCTL tap --name "RM critical review drafted"
$RPMCTL tap --role textbox --name "Add a task to the Plan"
$RPMCTL type "Email Prof. Rao about the citation format"
$RPMCTL key enter
$RPMCTL wait --role button --name "Email Prof. Rao"
$RPMCTL state files/companion.json            # what the app actually saved
```

- `tap` finds the element in the visible WebView by exact accessible name (then substring), scrolls it into view if needed, and taps its centre with `adb shell input tap`. Ambiguous names fail and list candidates; add `--role` or `--nth`. Native views (system dialogs, permission prompts, legacy screens) use `--native "Text"`.
- `type` commits text to the focused field like an IME (`--adb` for raw key events, ASCII only).
- `display large-text|max-text|landscape|wide|phone` changes the emulator's text scale or size. Check every changed screen at `phone` and `large-text`; use `max-text` when the change touches layout that can wrap.
- `open widget-capture|widget-voice` sends the intents the home-screen widget's pill and mic send. The widget's planner icon and `PlannerActivity` are not exported, so the planner is only reachable through the app's own UI.
- `eval` is for reading page state. Drive with `tap`/`type`/`key` so the proof follows the user's path.

The feature map in [`features/README.md`](features/README.md) lists every user-facing feature with its entry points, exact handles and the observable end state. A proof of a feature covers the entry points its file lists.

## Evidence

`shot <label>` writes `NN-<label>.png` (device pixels) and `NN-<label>.json` (on-screen elements, activity, URL, display settings) to `.verify/evidence/<run-id>/`. Every mutating command is also appended to `journal.jsonl` there. The folder is gitignored and survives `cleanup`.

Proof standards:

- Exercise the user's path: launcher or widget intent, then taps and typing. No internal setters, no `eval` that changes state, no desktop-browser substitute.
- Capture the action and the result: a shot before and after, not only the final screen.
- Verify side effects: read `state files/companion.json` (or `shared_prefs/...`) after a save, and show the exact stored value.
- Check the changed screen at `phone` and `large-text` (and `max-text` for wrapping layouts). Name the display in the shot label.
- Run `logs --errors` after a drive; a page error or crash fails the proof even if the screen looks right.
- Model-backed paths (Capture sorting, Jev, Suggest a Purpose) need an OpenRouter key, which the emulator does not have. Without a key, prove the keyless behavior (words saved, "Connect" offered) and mark the model path **UNVERIFIED**.
- The emulator is not Samsung One UI. Samsung keyboard, battery limits, audible alarms and real launcher widget placement stay **UNVERIFIED** until checked on the phone.

Reply with the evidence paths (`.verify/evidence/<run-id>/NN-*.png`).

## Regression scenarios and checks

```bash
$RPMCTL scenario --list       # device scenarios that encode past corrections
$RPMCTL scenario --all        # run them on the owned emulator (seeds its own data)
$RPMCTL check                 # npm test + npm run check:rules, logs into the evidence folder
```

The rule table in `AGENTS.md` names which scenario or check enforces each rule.

## Cleanup

```bash
$RPMCTL cleanup
```

Kills the emulator process tree that `launch` started (by its recorded pid, never by name), removes the DevTools port forward and `.verify/state.json`. Display and data changes die with the read-only emulator. Evidence stays; the output names the folder. Run `cleanup` after a failed attempt too.

## A physical phone

`--serial <adb-serial>` points `doctor`, `ui`, `shot`, `logs` and `state` at another device read-only (for example the S24 FE over wireless debugging). Every command that changes a device refuses any device `rpmctl` did not launch. Installing on the phone is a release step: follow `docs/testing.md` and the release rule in `AGENTS.md`, and only when the user asked for it.

## Gotchas

- The software-rendered emulator sometimes raises "System UI isn't responding", always on a fresh boot in the Device panel. `launch` answers Wait; otherwise tap Wait (`tap --native Wait`, or in the Device panel).
- The Capture sheet auto-closes 6 s after a receipt unless touched; the planner snackbar times out after 6 s (4 s without Undo). Wait for the element, not a fixed sleep.
- A WebView element hidden behind the bottom nav bar or the keyboard still has a rect; `ui` reports it as on screen. Look at the screenshot.
- `tap` uses `scrollIntoView` to bring an off-screen element into view. When scrolling itself is under test, use `scroll down|up` (a real swipe) first.
- Sample data dates are relative to the moment you run `seed`; reseed on a new day.
