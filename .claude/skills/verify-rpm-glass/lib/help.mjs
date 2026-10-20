import {DEFAULTS, DISPLAYS} from './runtime.mjs';

export const HELP = {
  _: `rpmctl drives the RPM Android app (com.rpm.prototype) on an S24 FE-sized emulator that it launches and owns.
Every command prints one JSON object on stdout, except ui --brief. Failures print {"ok":false,"error","fix"} and exit 1.

Usage: node .claude/skills/verify-rpm-glass/rpmctl.mjs <command> [options]

Lifecycle
  launch     Reuse the shared warm emulator (boot it if none), build/install the debug APK, open the app.
  doctor     Read-only health check: is this instance worth driving?
  sync       Push changed web code (android-companion, intent-v2) to the running app in seconds, no APK build.
  cleanup    End the run and keep the emulator warm (--stop stops it). Evidence is kept.
Drive
  seed       Replace the app's data with the sample plan (or --empty / --file), then reopen.
  open       Open a surface the way a user reaches it (capture, planner, widget intents).
  ui         List what is on screen: role, name, state, rect. --brief prints one line per element.
  tap        Tap an element by role/name/css (real touch through adb).
  type       Type text into the focused field.
  key        Press a key (back, enter, home, ...).
  scroll     Swipe up/down, or left/right across an element (row swipe actions).
  wait       Wait until an element appears or disappears.
  display    Switch screen size (phone, landscape, wide). phone = One UI default text.
Evidence
  shot       Screenshot + on-screen element list into the run's evidence folder.
  eval       Read a value from the page with JavaScript.
  state      List or read the app's private files (debug build only).
  logs       App logcat, or only crashes and page errors with --errors.
  check      Run the repo's full check suite (npm test + regression checks), logged to evidence.

Global options
  --serial <s>   Target another device read-only (doctor, ui, shot, logs, state). Mutating commands
                 only run on the emulator this tool launched.
  --port <n>     Launch console port. Default hashes the worktree path to an even port in 5580–5680.
  --cdp-port <n> Local DevTools port. Default hashes the worktree path to 10000–19999.
  --owner <token> Run owner from launch, or set RPMCTL_OWNER. Required for mutating commands,
                 including eval, scenario, cleanup and launch on an existing run. Wrong tokens refuse.
                 For one compatibility release only, a missing token warns instead of refusing.
                 Read-only ui, shot, state, logs, doctor, check and wait need no token.
Ports and worktree are reserved by a machine-wide lease under the OS temp folder. A dead emulator's
lease can be reclaimed; a live launch is also protected. Hash collisions need explicit free ports.

Typical run
  rpmctl launch
  export RPMCTL_OWNER=<owner from launch>
  rpmctl doctor
  rpmctl open planner && rpmctl tap --role button --name "Blocks" && rpmctl shot blocks-list
  rpmctl display landscape && rpmctl shot blocks-landscape && rpmctl display phone
  rpmctl check && rpmctl cleanup

Evidence lives in .verify/evidence/<run-id>/ (gitignored) and survives cleanup.
Run \`rpmctl <command> --help\` for details.`,
  sync: `sync
Bundles the web assets (scripts/build-companion-assets.mjs), copies the HTML, CSS and JS into the debug app's
files/dev-companion/ (served before the APK's own copy, debug builds only) and reloads every open RPM page.
Takes about 5 seconds, against about a minute for \`launch --build\`. Java or manifest changes still need \`launch --build\`.
The next install by \`launch\` deletes the synced copy. Screenshots record the synced assets' hash (webSha256), and
npm run check:evidence accepts them for web-only changes.`,
  launch: `launch [--wait SECONDS] [--avd NAME] [--port N] [--cdp-port N] [--owner TOKEN] [--build] [--no-build] [--apk FILE] [--no-install] [--gpu MODE] [--timeout SECONDS]
Boots AVD ${DEFAULTS.avd} headless as emulator-<port> (default ${DEFAULTS.port}) with -read-only, so nothing the run does
persists into the AVD. It always uses the host GPU: software modes (swiftshader, guest) use about 12x more CPU and are refused.
The startup line "Your GPU cannot be used for hardware rendering" is harmless; set RPM_ALLOW_SOFTWARE_GPU=1 only if the host-GPU emulator stays black, crashes or goes offline. Builds app-debug.apk when it is missing or older than the app sources (--build forces,
--no-build skips), installs it with all runtime permissions, opens the app and dismisses System UI ANR prompts.
--apk installs that APK instead (e.g. an older build, to reproduce a past bug); doctor then reports the mismatch. An APK from another checkout (<checkout>/app/build/outputs/apk/...) saves the run's evidence in that checkout, so its own check:evidence finds it; sync then refuses.
--no-install leaves whatever the emulator image already has (doctor shows its version and signer).
Idempotent: when the owned emulator is already up it only re-installs if the APK changed and re-opens the app.
Shared: every worktree uses one warm emulator on console port ${DEFAULTS.port}. When another worktree's run ended, launch
reuses it with no boot, wipes the app's data and synced web assets, resets the display and installs this APK.
Output "emulator" says booted or reused. While another run holds it, launch refuses and names that run;
--wait SECONDS queues, retrying every 15 s. A run idle for 20 min (RPMCTL_IDLE_MINUTES) can be taken over.
Default CDP port hashes the path to 10000–19999 (this checkout: ${DEFAULTS.cdpPort}). Overrides are retained
for later launches. A machine-wide lease in ~/.cache/rpmctl-leases (RPMCTL_LEASE_ROOT) reserves the worktree,
both emulator ports and the CDP port. Dead emulator leases can be reclaimed; concurrent launches refuse.
Refuses to use a port where an emulator it did not start is running. cleanup releases the lease.
Save the random owner returned by launch: export RPMCTL_OWNER=<owner from launch>
PowerShell: $env:RPMCTL_OWNER = '<owner from launch>'
Mutating commands require --owner TOKEN or RPMCTL_OWNER, including launch on an owned emulator.
For one compatibility release, a missing token warns instead of refusing. A wrong token always refuses.
Output: {ok, serial, pid, owner, port, cdpPort, runId, evidence, apk:{versionName, sha256}, seconds}`,
  doctor: `doctor
Read-only. Checks: adb, owned emulator alive and booted, read-only instance, display size/density/text scale,
installed package version and APK hash against app/build.gradle and the local build, APK newer than sources,
app process, WebView DevTools reachable, current page, System UI ANR prompt, app crashes since launch.
Output: {ok, checks:[{name, ok, detail, fix?}]}. ok=false names the first fix to apply.`,
  open: `open <surface>
  capture        Launcher icon path (MAIN/LAUNCHER intent): the Capture sheet.
  planner        Capture sheet -> "More: planner, history, settings" -> "Planner" (taps, like a user).
  history        Capture sheet -> More -> "History".
  widget-capture The intent the home-screen widget's Capture bar sends (com.rpm.widget.capture).
  widget-voice   The intent the widget's mic sends (com.rpm.widget.voice); starts voice input.
PlannerActivity is not exported, so the planner can only be reached through the app's own UI.
The launcher and am start resume the app's task as it was, so when the planner is in front, capture/widget-*
press Back (like a user) until Capture shows; the output reports pressedBackFromPlanner. The real widget clears
the task instead (CLEAR_TOP), which am start cannot reproduce.`,
  seed: `seed [--empty | --file companion.json]
Force-stops the app, deletes all its data (files, shared_prefs, databases, WebView storage, so no draft or
legacy record carries over) and writes files/companion.json through run-as (owned emulator, debug build only).
Default data is scripts/gauntlet/seed.mjs: 4 Areas, 8 Blocks, ~35 tasks, Inbox items, dates relative to now,
so Today, Blocks, Inbox and the weekly review have something to show. --empty deletes the store (fresh-install
state). --file loads a store you saved earlier (e.g. from \`rpmctl state files/companion.json\`).
Output: {stored:{version, tasks, blocks, projects}} read back from the device.`,
  ui: `ui [--all] [--native] [--brief]
Lists visible WebView elements: {ref, role, name, id, key, rect:[x,y,w,h] in CSS px, state}. --all includes
off-screen elements and plain paragraphs. --native lists the Android view tree instead (system dialogs, native
screens, launcher). Output also has the page title, url, data-view, viewport and devicePixelRatio.
--brief prints role "name" [state] on one line per element. Combine with --all to include elements marked
(off-screen). Empty states are omitted. Names and values are quoted and escaped. Default JSON is unchanged.`,
  tap: `tap (--name TEXT [--role ROLE] | --css SELECTOR | --native TEXT | --xy X,Y) [--nth N] [--long]
Finds the element in the visible WebView (exact accessible name first, then substring), scrolls it into view if
needed, and taps its centre with \`adb shell input tap\` (a real touch). --native matches text/content-desc in the
Android view tree (system dialogs, native screens). --xy taps device pixels. --long holds for 800ms.
Ambiguous names fail and list the candidates: add --role or --nth.`,
  type: `type <text> [--adb]
Types into the focused field via DevTools Input.insertText (an IME commit: fires input events, keeps unicode).
--adb uses \`adb shell input text\` instead (ASCII only). Tap the field first.`,
  key: `key <back|enter|home|tab|del|escape|recents|KEYCODE_*>
Sends an Android key event. back closes sheets, enter submits in the composer.`,
  scroll: `scroll <down|up|left|right> [--amount PX] [--name TEXT [--role ROLE] | --css SELECTOR] [--ms DURATION]
A real touch swipe. down/up move the content like a thumb (default 900 device px, from the screen centre).
left/right swipe sideways (default 500 px), across the named element's centre when --name/--css is given: use it
for a task row's swipe actions (right = Schedule, left = Delete) or to step days. --ms sets the gesture length.`,
  wait: `wait (--name TEXT [--role ROLE] | --css SELECTOR) [--gone] [--timeout MS]
Polls the visible WebView every 300ms until the element is on screen (or gone with --gone). Default timeout 10000.`,
  display: `display <${Object.keys(DISPLAYS).join('|')}|reset> [--font-scale 0.85-2.0]
${Object.entries(DISPLAYS).map(([k, v]) => `  ${k.padEnd(10)} ${v.note}`).join('\n')}
  reset      Same as phone.
Normal text is the default. --font-scale checks larger text only when a change touches text sizing and the user asks.
Changes only the owned emulator. Records the before/after display in the output.`,
  shot: `shot <label>
Saves NN-<label>.png (adb screencap, device pixels) and NN-<label>.json (on-screen elements, foreground activity,
url, display settings, time) into .verify/evidence/<run-id>/. Output: {png, json}.`,
  eval: `eval <javascript expression>
Evaluates in the visible WebView and prints the JSON value. Promises are awaited. Use it to READ state (document,
localStorage, rendered text); drive the UI with tap/type so the proof follows the user's path.`,
  state: `state [relative-path]
Without a path: lists the app's private files (files/, shared_prefs/, databases/) via run-as.
With a path (e.g. files/companion.json): prints its text. Debug builds only.`,
  logs: `logs [--errors] [--lines N]
Logcat for the app's process plus WebView console lines (tag chromium). --errors keeps only crashes, ANRs,
uncaught exceptions and console errors since launch. Default --lines 200.`,
  scenario: `scenario (--list | --all | <id>...)
Runs scenarios from .claude/skills/verify-rpm-glass/scenarios/ on the owned emulator. Each one seeds its own data,
drives the app like a user, asserts the rule it encodes, and saves shots named <id>-*. After each scenario the runner
also fails it if a raw script error is on screen or the page logged an uncaught error.
A scenario marked knownBug is a recorded product bug: it is reported as known-bug while it fails and as
known-bug-fixed (a failure: delete the marker) once it passes. ok=true when every scenario passes or is a known bug.
Output: {ok, results:[{id, status, ms, facts, failure?, shots}]}`,
  check: `check [--only js|cloud|java|rules]
Runs npm test (JS, Convex, typecheck, Java) and npm run check:rules (regression checks from past corrections).
Logs go to .verify/evidence/<run-id>/check-*.log. ok=false if any step fails.`,
  cleanup: `cleanup [--stop] [--keep-emulator]
Removes the DevTools port forward, deletes .verify/state.json and releases the lease, keeping the shared emulator
warm for the next run. A detached watcher stops it after 20 min with no run. --stop also kills the emulator process
tree that launch started (by its recorded pid, never by name). --keep-emulator retains both state and lease.
Requires --owner TOKEN or RPMCTL_OWNER (missing tokens warn for one compatibility release).
The evidence folder is never touched. Output names the surviving evidence folder.`,
};
