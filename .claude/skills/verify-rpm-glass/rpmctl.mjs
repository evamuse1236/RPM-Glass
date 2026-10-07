#!/usr/bin/env node
// rpmctl: launch, health-check, drive and screenshot the RPM Android app on an emulator it owns. Run `rpmctl --help`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {PACKAGE, LAUNCHER, UserError, adb, shell, devices, startEmulator, processAlive, killTree, sleep, waitFor,
  appPid, foregroundActivity, displayInfo, nativeNodes, dismissAnr, sdkRoot} from './lib/device.mjs';
import {inPage, toDevice, pageTargets} from './lib/page.mjs';

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, '../../..');
const WORK = path.join(ROOT, '.verify');
const STATE = path.join(WORK, 'state.json');
const EVIDENCE = path.join(WORK, 'evidence');
const APK = path.join(ROOT, 'app/build/outputs/apk/debug/app-debug.apk');
const SOURCES = ['app/src/main', 'android-companion', 'chat-prototype', 'cli', 'intent-v2/src', 'intent-v2/adapters', 'intent-v2/prompts', 'scripts/build-companion-assets.mjs', 'app/build.gradle'];
const DEFAULTS = {avd: 'Galaxy_S24_FE_API_36', port: 5580, gpu: 'swiftshader_indirect', cdpPort: 9333};
const DISPLAYS = {
  phone: {fontScale: '1.0', rotation: 0, size: null, density: null, note: 'S24 FE portrait, default text'},
  'large-text': {fontScale: '1.3', rotation: 0, size: null, density: null, note: '130% system text'},
  'max-text': {fontScale: '2.0', rotation: 0, size: null, density: null, note: '200% system text (Android maximum)'},
  landscape: {fontScale: '1.0', rotation: 1, size: null, density: null, note: 'S24 FE rotated'},
  wide: {fontScale: '1.0', rotation: 0, size: '1600x2560', density: 320, note: '800dp-wide tablet/unfolded width'},
};

const HELP = {
  _: `rpmctl drives the RPM Android app (com.rpm.prototype) on an S24 FE-sized emulator that it launches and owns.
Every command prints one JSON object on stdout. Failures print {"ok":false,"error","fix"} and exit 1.

Usage: node .claude/skills/verify-rpm-glass/rpmctl.mjs <command> [options]

Lifecycle
  launch     Boot the owned emulator, build/install the debug APK, open the app.
  doctor     Read-only health check: is this instance worth driving?
  cleanup    Kill only what launch started. Evidence is kept.
Drive
  seed       Replace the app's data with the sample plan (or --empty / --file), then reopen.
  open       Open a surface the way a user reaches it (capture, planner, widget intents).
  ui         List what is on screen: role, name, state, rect.
  tap        Tap an element by role/name/css (real touch through adb).
  type       Type text into the focused field.
  key        Press a key (back, enter, home, ...).
  scroll     Swipe up/down, or left/right across an element (row swipe actions).
  wait       Wait until an element appears or disappears.
  display    Switch screen size / text scale (phone, large-text, max-text, landscape, wide).
Evidence
  shot       Screenshot + on-screen element list into the run's evidence folder.
  eval       Read a value from the page with JavaScript.
  state      List or read the app's private files (debug build only).
  logs       App logcat, or only crashes and page errors with --errors.
  check      Run the repo's full check suite (npm test + regression checks), logged to evidence.

Global options
  --serial <s>   Target another device read-only (doctor, ui, shot, logs, state). Mutating commands
                 only run on the emulator this tool launched.
  --cdp-port <n> Local port for the WebView DevTools forward (default 9333).

Typical run
  rpmctl launch && rpmctl doctor
  rpmctl open planner && rpmctl tap --role button --name "Blocks" && rpmctl shot blocks-list
  rpmctl display large-text && rpmctl shot blocks-large-text && rpmctl display phone
  rpmctl check && rpmctl cleanup

Evidence lives in .verify/evidence/<run-id>/ (gitignored) and survives cleanup.
Run \`rpmctl <command> --help\` for details.`,
  launch: `launch [--avd NAME] [--port N] [--build] [--no-build] [--apk FILE] [--no-install] [--gpu MODE] [--timeout SECONDS]
Boots AVD ${DEFAULTS.avd} headless as emulator-<port> (default ${DEFAULTS.port}) with -read-only, so nothing the run does
persists into the AVD. Builds app-debug.apk when it is missing or older than the app sources (--build forces,
--no-build skips), installs it with all runtime permissions, opens the app and dismisses System UI ANR prompts.
--apk installs that APK instead (e.g. an older build, to reproduce a past bug); doctor then reports the mismatch.
--no-install leaves whatever the emulator image already has (doctor shows its version and signer).
Idempotent: when the owned emulator is already up it only re-installs if the APK changed and re-opens the app.
Refuses to use a port where an emulator it did not start is running.
Output: {ok, serial, pid, runId, evidence, apk:{versionName, sha256}, bootSeconds}`,
  doctor: `doctor
Read-only. Checks: adb, owned emulator alive and booted, read-only instance, display size/density/text scale,
installed package version and APK hash against app/build.gradle and the local build, APK newer than sources,
app process, WebView DevTools reachable, current page, System UI ANR prompt, app crashes since launch.
Output: {ok, checks:[{name, ok, detail, fix?}]}. ok=false names the first fix to apply.`,
  open: `open <surface>
  capture        Launcher icon path (MAIN/LAUNCHER intent): the Capture sheet.
  planner        Capture sheet -> "More: planner, history, settings" -> "Open planner" (taps, like a user).
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
  ui: `ui [--all] [--native]
Lists visible WebView elements: {ref, role, name, id, key, rect:[x,y,w,h] in CSS px, state}. --all includes
off-screen elements and plain paragraphs. --native lists the Android view tree instead (system dialogs, native
screens, launcher). Output also has the page title, url, data-view, viewport and devicePixelRatio.`,
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
  display: `display <${Object.keys(DISPLAYS).join('|')}|reset>
${Object.entries(DISPLAYS).map(([k, v]) => `  ${k.padEnd(10)} ${v.note}`).join('\n')}
  reset      Same as phone.
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
  cleanup: `cleanup [--keep-emulator]
Removes the DevTools port forward, kills the emulator process tree that launch started (by its recorded pid,
never by name) and deletes .verify/state.json. Display overrides die with the read-only emulator.
The evidence folder is never touched. Output names the surviving evidence folder.`,
};

function parseArgs(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const readState = () => fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
const writeState = s => { fs.mkdirSync(WORK, {recursive: true}); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const gradleVersion = () => {
  const g = fs.readFileSync(path.join(ROOT, 'app/build.gradle'), 'utf8');
  return {versionName: g.match(/versionName "([^"]+)"/)?.[1], versionCode: g.match(/versionCode (\d+)/)?.[1]};
};
function newestSource() {
  let newest = 0, file = null;
  const walk = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (!['node_modules', 'build', 'experiments', '.gradle', 'companion'].includes(f)) walk(path.join(p, f)); }
    else if (st.mtimeMs > newest) { newest = st.mtimeMs; file = p; }
  };
  for (const s of SOURCES) if (fs.existsSync(path.join(ROOT, s))) walk(path.join(ROOT, s));
  return {mtime: newest, file: file && path.relative(ROOT, file)};
}
const apkStale = () => !fs.existsSync(APK) || fs.statSync(APK).mtimeMs < newestSource().mtime;

function evidenceDir(state) {
  const dir = path.join(EVIDENCE, state?.runId ?? `adhoc-${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}
function journal(state, entry) {
  fs.appendFileSync(path.join(evidenceDir(state), 'journal.jsonl'), JSON.stringify({at: new Date().toISOString(), ...entry}) + '\n');
}

// Resolves which device a command targets and whether it may change it.
function target(args, {mutates}) {
  const state = readState();
  const serial = args.serial ?? state?.serial;
  if (!serial) throw new UserError('No emulator launched by rpmctl.', 'Run `rpmctl launch` (or pass --serial for a read-only look at another device).');
  const owned = state && state.serial === serial && processAlive(state.pid);
  if (mutates && !owned) throw new UserError(`${serial} was not launched by rpmctl (or its emulator has exited); refusing to change it.`,
    args.serial ? 'Mutating commands only run on the owned emulator. Drop --serial, or use doctor/ui/shot/logs/state for read-only checks.' : 'Run `rpmctl launch`.');
  if (!devices().some(d => d.serial === serial && d.state === 'device')) throw new UserError(`${serial} is not online in adb.`, owned ? 'Run `rpmctl doctor`; if the emulator hung, `rpmctl cleanup` then `rpmctl launch`.' : 'Connect the device and check `adb devices`.');
  return {serial, state: owned ? state : null, cdpPort: Number(args.cdpPort ?? state?.cdpPort ?? DEFAULTS.cdpPort)};
}

// .bat and .cmd launchers (gradlew.bat, npm.cmd) need cmd.exe on Windows.
const viaShell = (cmd, args) => process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', cmd, ...args]] : [cmd, args];

// SHA-256 of the APK's signing certificate, via the SDK's apksigner (needs Java on PATH or JAVA_HOME).
function signer(apk) {
  const tools = path.join(sdkRoot(), 'build-tools');
  const latest = fs.existsSync(tools) ? fs.readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).at(-1) : null;
  if (!latest) return null;
  const bin = path.join(tools, latest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const r = spawnSync(...viaShell(bin, ['verify', '--print-certs', apk]), {encoding: 'utf8', windowsHide: true});
  return r.stdout?.match(/certificate SHA-256 digest: ([0-9a-f]+)/)?.[1] ?? null;
}

function build() {
  const gradlew = path.join(ROOT, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const r = spawnSync(...viaShell(gradlew, ['--no-daemon', '-q', 'assembleDebug']), {cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new UserError(`Gradle assembleDebug failed:\n${(r.stderr || r.stdout).trim().slice(-2000)}`, 'Fix the build error above, run `npm ci` if node_modules is missing, then `rpmctl launch --build`.');
}

function install(serial, apk) {
  const r = adb(serial, ['install', '-r', '-g', apk], {allowFail: true, timeout: 180000});
  if (/Success/.test(r)) return 'installed';
  const err = r + '';
  // Only reachable on the owned -read-only emulator, so removing a differently signed copy never touches real data.
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/.test(err)) {
    adb(serial, ['uninstall', PACKAGE], {allowFail: true});
    const again = adb(serial, ['install', '-r', '-g', apk], {timeout: 180000});
    if (/Success/.test(again)) return 'replaced-differently-signed-copy';
  }
  throw new UserError(`APK install failed: ${err.trim().slice(0, 500)}`, 'Run `rpmctl doctor`; rebuild with `rpmctl launch --build`.');
}

async function openLauncher(serial, action) {
  const args = ['am', 'start', '-W', '-n', LAUNCHER];
  if (action) args.push('-a', action); else args.push('-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER');
  adb(serial, ['shell', ...args], {timeout: 60000});
  await waitFor(() => appPid(serial), {timeout: 30000, what: 'the app process'});
}

async function tapElement(serial, cdpPort, query) {
  const page = await inPage(serial, cdpPort);
  try {
    const found = await page.evaluate(`(q) => window.__rpmLocate(q)`, {...query, scroll: true});
    if (found.error) throw new UserError(found.error + (found.candidates ? `. On screen: ${found.candidates.join(', ')}` : ''), 'Run `rpmctl ui` to see names, then retry with --role/--nth or --css.');
    const dpr = await page.evaluate('devicePixelRatio');
    const [x, y, w, h] = found.match.rect;
    const at = toDevice(page, dpr, [x + w / 2, y + h / 2]);
    return {at, match: found.match};
  } finally { page.close(); }
}

const touch = (serial, [x, y], long) => shell(serial, long ? `input swipe ${x} ${y} ${x} ${y} 800` : `input tap ${x} ${y}`);

const commands = {
  async launch(args) {
    const port = Number(args.port ?? DEFAULTS.port), serial = `emulator-${port}`;
    let state = readState();
    const t0 = Date.now();
    if (state && !(state.serial === serial && processAlive(state.pid))) {
      if (processAlive(state.pid)) throw new UserError(`An rpmctl emulator is already running as ${state.serial}.`, 'Use it (drop --port), or run `rpmctl cleanup` first.');
      fs.rmSync(STATE, {force: true}); state = null;
    }
    if (!state) {
      if (devices().some(d => d.serial === serial)) throw new UserError(`${serial} is already running and was not started by rpmctl.`, `Pick a free port: rpmctl launch --port ${port + 10}. Never drive an instance you did not start.`);
      const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      state = {serial, port, avd: args.avd ?? DEFAULTS.avd, runId, cdpPort: Number(args.cdpPort ?? DEFAULTS.cdpPort), startedAt: new Date().toISOString()};
      const log = path.join(evidenceDir(state), 'emulator.log');
      const {pid, args: emuArgs} = startEmulator({avd: state.avd, port, logFile: log, gpu: args.gpu ?? DEFAULTS.gpu});
      Object.assign(state, {pid, emulatorArgs: emuArgs});
      writeState(state);
      await waitFor(() => devices().some(d => d.serial === serial && d.state === 'device'), {timeout: Number(args.timeout ?? 240) * 1000, what: `${serial} to come online (see ${log})`});
      await waitFor(() => shell(serial, 'getprop sys.boot_completed', {allowFail: true}).trim() === '1', {timeout: Number(args.timeout ?? 240) * 1000, what: 'Android to finish booting'});
      shell(serial, 'input keyevent 82', {allowFail: true});
      shell(serial, 'settings put global stay_on_while_plugged_in 7', {allowFail: true});
      shell(serial, 'settings put system accelerometer_rotation 0', {allowFail: true});
    }
    const apk = args.apk ? path.resolve(String(args.apk)) : APK;
    if (!args.apk && (args.build || (!args.noBuild && apkStale()))) build();
    if (!fs.existsSync(apk)) throw new UserError(`No APK at ${apk}.`, 'Run `rpmctl launch --build`.');
    const apkHash = sha256(fs.readFileSync(apk));
    const installed = shell(serial, `pm path ${PACKAGE}`, {allowFail: true}).includes('package:');
    const installResult = args.noInstall ? (installed ? 'skipped (kept what the emulator had)' : 'skipped (not installed)')
      : state.installedSha256 === apkHash && installed ? 'already-installed' : install(serial, apk);
    if (!args.noInstall) state.installedSha256 = apkHash;
    state.appLogSince = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim();
    writeState(state);
    dismissAnr(serial);
    await openLauncher(serial);
    await sleep(2500);
    const anr = dismissAnr(serial);
    const out = {ok: true, serial, pid: state.pid, runId: state.runId, evidence: evidenceDir(state), install: installResult,
      apk: {path: path.relative(ROOT, apk), ...(args.apk ? {} : gradleVersion()), sha256: apkHash}, dismissedAnr: anr, seconds: Math.round((Date.now() - t0) / 1000),
      next: 'rpmctl doctor'};
    journal(state, {command: 'launch', result: out});
    return out;
  },

  async doctor(args) {
    const checks = [];
    const add = (name, ok, detail, fix) => checks.push({name, ok, detail, ...(ok ? {} : {fix})});
    try { sdkRoot(); add('android-sdk', true, sdkRoot()); } catch (e) { add('android-sdk', false, e.message, e.fix); return {ok: false, checks}; }
    const state = readState();
    const serial = args.serial ?? state?.serial;
    if (!args.serial) add('launched-by-rpmctl', !!state, state ? `${state.serial} run ${state.runId}` : 'no .verify/state.json', 'Run `rpmctl launch`.');
    if (!serial) return {ok: false, checks};
    const owned = !!state && state.serial === serial;
    if (owned) add('emulator-process', processAlive(state.pid), `pid ${state.pid}`, 'The emulator exited. Run `rpmctl cleanup` then `rpmctl launch`.');
    const online = devices().find(d => d.serial === serial);
    add('adb-online', online?.state === 'device', online ? `${serial} ${online.state}` : `${serial} not listed`, 'Wait for boot, or `rpmctl cleanup && rpmctl launch`.');
    if (online?.state !== 'device') return {ok: false, checks};
    add('booted', shell(serial, 'getprop sys.boot_completed', {allowFail: true}).trim() === '1', 'sys.boot_completed', 'Wait 30s and rerun doctor.');
    if (owned) add('read-only-instance', state.emulatorArgs?.includes('-read-only'), 'changes are discarded when the emulator exits', 'Relaunch with rpmctl so the AVD is not modified.');
    else add('target', true, `${serial} (not launched by rpmctl: read-only checks only)`);
    const display = displayInfo(serial);
    add('display', true, display);
    const want = gradleVersion();
    const dump = shell(serial, `dumpsys package ${PACKAGE}`, {allowFail: true});
    const installed = {versionName: dump.match(/versionName=(\S+)/)?.[1], versionCode: dump.match(/versionCode=(\d+)/)?.[1], debuggable: /flags=\[[^\]]*DEBUGGABLE/.test(dump)};
    add('installed-version', installed.versionName === want.versionName && installed.versionCode === want.versionCode,
      {installed, appBuildGradle: want}, installed.versionName ? 'Rebuild and reinstall: `rpmctl launch --build`.' : 'App not installed: `rpmctl launch`.');
    add('debuggable', installed.debuggable, 'needed for WebView DevTools and `state`', 'Install the debug APK with `rpmctl launch --build`.');
    if (fs.existsSync(APK)) {
      const local = sha256(fs.readFileSync(APK));
      const remotePath = shell(serial, `pm path ${PACKAGE}`, {allowFail: true}).match(/package:(\S+base\.apk)/)?.[1];
      const remote = remotePath ? sha256(adb(serial, ['exec-out', 'cat', remotePath], {binary: true})) : null;
      add('installed-apk-matches-local-build', local === remote, {local: local.slice(0, 16), installed: remote?.slice(0, 16)}, owned ? 'The device runs a different build. `rpmctl launch` installs the local one.' : 'The phone runs a different build than this checkout. Compare branch, working tree and installed version before any release (AGENTS.md).');
      if (remotePath) {
        const pulled = path.join(WORK, 'installed-base.apk');
        fs.mkdirSync(WORK, {recursive: true});
        fs.writeFileSync(pulled, adb(serial, ['exec-out', 'cat', remotePath], {binary: true}));
        const [mine, theirs] = [signer(APK), signer(pulled)];
        fs.rmSync(pulled, {force: true});
        add('installed-signer-matches-local', !!mine && mine === theirs, {local: mine?.slice(0, 16) ?? 'apksigner unavailable', installed: theirs?.slice(0, 16) ?? 'apksigner unavailable'},
          owned ? '`rpmctl launch` replaces it on this throwaway emulator.' : 'This build cannot update the installed app in place: Android would require an uninstall, which deletes the app data. Do not uninstall. Build with the key the installed app was signed with (docs/phone-setup.md).');
      }
      const src = newestSource();
      add('apk-newer-than-sources', !apkStale(), {apkBuilt: new Date(fs.statSync(APK).mtimeMs).toISOString(), newestSource: src.file}, 'Sources changed since the build: `rpmctl launch --build`.');
    } else add('local-apk', false, 'app/build/outputs/apk/debug/app-debug.apk missing', '`rpmctl launch --build`.');
    const pid = appPid(serial);
    add('app-running', !!pid, pid ? `pid ${pid}, foreground ${foregroundActivity(serial)}` : 'not running', '`rpmctl open capture`.');
    if (pid) {
      try {
        const pages = await pageTargets(serial, Number(args.cdpPort ?? state?.cdpPort ?? DEFAULTS.cdpPort));
        add('webview-devtools', true, pages.map(p => ({title: p.title, url: p.url, visible: p.view.visible})));
      } catch (e) { add('webview-devtools', false, e.message, e.fix); }
    }
    const anr = nativeNodes(serial).some(n => /isn.t responding/i.test(n.text ?? ''));
    add('no-anr-prompt', !anr, anr ? 'a System UI / app not responding prompt is on screen' : 'none', owned ? '`rpmctl tap --native Wait`, then retry.' : 'Dismiss it on the device.');
    const crashes = errorLines(serial, owned ? state.appLogSince : null).filter(l => /FATAL EXCEPTION|ANR in com\.rpm/.test(l));
    add('no-app-crash', !crashes.length, crashes.length ? crashes.slice(0, 5) : 'no FATAL EXCEPTION / ANR since launch', 'Read `rpmctl logs --errors`.');
    const failed = checks.filter(c => !c.ok);
    return {ok: !failed.length, ...(failed.length ? {firstFix: failed[0].fix} : {}), checks};
  },

  async open(args) {
    const {serial, state} = target(args, {mutates: true});
    const surface = args._[0];
    const {cdpPort} = target(args, {mutates: false});
    const rendered = async selector => waitFor(async () => {
      try { const page = await inPage(serial, cdpPort); try { return await page.evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`); } finally { page.close(); } }
      catch (e) { if (e instanceof UserError) return false; throw e; }
    }, {timeout: 20000, every: 400, what: `the ${surface} screen to render`});
    const plannerInFront = () => /PlannerActivity/.test(foregroundActivity(serial) ?? '');
    let backs = 0;
    if (['capture', 'widget-capture', 'widget-voice', 'history'].includes(surface)) {
      await openLauncher(serial, surface.startsWith('widget-') ? `com.rpm.widget.${surface.slice(7)}` : undefined);
      // The launcher (and am start) resume the task as it was; the real widget clears it. Back out of the planner like a user.
      while (plannerInFront() && backs < 6) { shell(serial, 'input keyevent 4'); backs++; await sleep(700); }
      await rendered('#message');
      if (surface === 'history') {
        touch(serial, (await tapElement(serial, cdpPort, {name: 'More: planner, history, settings', role: 'button'})).at);
        await sleep(700);
        touch(serial, (await tapElement(serial, cdpPort, {name: 'History', role: 'menuitem'})).at);
      }
    } else if (surface === 'planner') {
      await openLauncher(serial);
      if (!plannerInFront()) {
        await rendered('#message');
        touch(serial, (await tapElement(serial, cdpPort, {name: 'More: planner, history, settings', role: 'button'})).at);
        await sleep(700);
        touch(serial, (await tapElement(serial, cdpPort, {name: 'Open planner', role: 'menuitem'})).at);
      }
      await rendered('#nav-bar button');
    } else throw new UserError(`Unknown surface "${surface ?? ''}".`, 'One of: capture, planner, history, widget-capture, widget-voice. See `rpmctl open --help`.');
    await sleep(600);
    const out = {ok: true, surface, activity: foregroundActivity(serial), ...(backs ? {pressedBackFromPlanner: backs} : {})};
    journal(state, {command: 'open', args: args._, result: out});
    return out;
  },

  async seed(args) {
    const {serial, state} = target(args, {mutates: true});
    let data;
    if (args.empty) data = null;
    else if (args.file) { data = JSON.parse(fs.readFileSync(path.resolve(String(args.file)), 'utf8')); if (data.ok && data.json) data = data.json; }
    else data = (await import(new URL('../../../scripts/gauntlet/seed.mjs', import.meta.url))).seedStore(new Date()).data;
    shell(serial, `am force-stop ${PACKAGE}`);
    if (data) {
      const local = path.join(evidenceDir(state), 'seed-companion.json');
      fs.writeFileSync(local, JSON.stringify(data));
      adb(serial, ['push', local, '/data/local/tmp/rpm-seed.json']);
      adb(serial, ['shell', 'run-as', PACKAGE, 'sh', '-c', "'rm -rf files shared_prefs databases app_webview cache && mkdir -p files && cp /data/local/tmp/rpm-seed.json files/companion.json'"]);
      adb(serial, ['shell', 'rm', '-f', '/data/local/tmp/rpm-seed.json']);
    } else adb(serial, ['shell', 'run-as', PACKAGE, 'sh', '-c', "'rm -rf files shared_prefs databases app_webview cache'"]);
    await openLauncher(serial);
    await sleep(2000);
    const stored = adb(serial, ['exec-out', 'run-as', PACKAGE, 'cat', 'files/companion.json'], {allowFail: true});
    let summary = null;
    try { const d = JSON.parse(stored); summary = {version: d.version, tasks: d.entries?.length, blocks: d.planner?.blocks?.length, projects: d.planner?.projects?.length}; } catch {}
    const out = {ok: true, seeded: args.empty ? 'empty' : args.file ? String(args.file) : 'scripts/gauntlet/seed.mjs (dates relative to now)', stored: summary};
    journal(state, {command: 'seed', result: out});
    return out;
  },

  async ui(args) {
    const {serial, cdpPort} = target(args, {mutates: false});
    if (args.native) return {ok: true, activity: foregroundActivity(serial), nodes: nativeNodes(serial)};
    const page = await inPage(serial, cdpPort);
    try { return {ok: true, activity: foregroundActivity(serial), ...(await page.evaluate(`(all) => window.__rpmSnapshot(all)`, !!args.all))}; }
    finally { page.close(); }
  },

  async tap(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    let at, match;
    if (args.xy) at = String(args.xy).split(',').map(Number);
    else if (args.native) {
      const want = String(args.native).toLowerCase();
      const nodes = nativeNodes(serial);
      const hits = nodes.filter(n => [n.text, n.desc].some(v => v?.toLowerCase() === want));
      const hit = (hits.length ? hits : nodes.filter(n => [n.text, n.desc].some(v => v?.toLowerCase().includes(want))))[Number(args.nth ?? 0)];
      if (!hit) throw new UserError(`No native view with text/description "${args.native}".`, 'Run `rpmctl ui --native` to see what is on screen.');
      at = hit.center; match = hit;
    } else if (args.name || args.css) ({at, match} = await tapElement(serial, cdpPort, {name: args.name, role: args.role, css: args.css, nth: args.nth === undefined ? undefined : Number(args.nth)}));
    else throw new UserError('Nothing to tap.', 'Pass --name TEXT [--role ROLE], --css SELECTOR, --native TEXT or --xy X,Y.');
    touch(serial, at, args.long);
    await sleep(Number(args.settle ?? 600));
    const out = {ok: true, tapped: match ? {role: match.role ?? match.cls, name: match.name ?? match.text ?? match.desc} : null, at, long: !!args.long};
    journal(state, {command: 'tap', args, result: out});
    return out;
  },

  async type(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    const text = args._.join(' ');
    if (!text) throw new UserError('Nothing to type.', 'rpmctl type "Buy milk tomorrow at 9"');
    if (args.adb) {
      if (/[^\x20-\x7e]/.test(text)) throw new UserError('--adb types ASCII only.', 'Drop --adb to type unicode through DevTools.');
      adb(serial, ['shell', 'input', 'text', text.replace(/ /g, '%s').replace(/([\\'"`$&|;<>()*?!#~])/g, '\\$1')]);
    } else {
      const page = await inPage(serial, cdpPort);
      try {
        const focused = await page.evaluate(`(() => { const a = document.activeElement; return a && a !== document.body ? (a.id || a.tagName) : null; })()`);
        if (!focused) throw new UserError('No field has focus in the page.', 'Tap the field first, e.g. `rpmctl tap --role textbox --name "Capture a thought"`.');
        await page.send('Input.insertText', {text});
      } finally { page.close(); }
    }
    await sleep(400);
    const out = {ok: true, typed: text};
    journal(state, {command: 'type', result: out});
    return out;
  },

  async key(args) {
    const {serial, state} = target(args, {mutates: true});
    const names = {back: 4, enter: 66, home: 3, tab: 61, del: 67, escape: 111, recents: 187, menu: 82};
    const k = args._[0];
    const code = names[k?.toLowerCase()] ?? (/^KEYCODE_\w+$/.test(k ?? '') ? k : null);
    if (!code) throw new UserError(`Unknown key "${k ?? ''}".`, `One of ${Object.keys(names).join(', ')} or a KEYCODE_* name.`);
    shell(serial, `input keyevent ${code}`);
    await sleep(Number(args.settle ?? 600));
    journal(state, {command: 'key', key: k});
    return {ok: true, key: k};
  },

  async scroll(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    const dir = args._[0];
    if (!['up', 'down', 'left', 'right'].includes(dir)) throw new UserError('Scroll needs a direction.', 'rpmctl scroll down [--amount 900] | rpmctl scroll right --name "Buy a new notebook"');
    const [w, h] = (displayInfo(serial).size ?? '1080x2340').split('x').map(Number);
    let [x, y] = [Math.round(w / 2), Math.round(h / 2)];
    if (args.name || args.css) [x, y] = (await tapElement(serial, cdpPort, {name: args.name, role: args.role, css: args.css, nth: args.nth === undefined ? undefined : Number(args.nth)})).at;
    const vertical = dir === 'up' || dir === 'down';
    const amount = Number(args.amount ?? (vertical ? 900 : 500)), sign = dir === 'down' || dir === 'left' ? -1 : 1;
    const [x1, y1, x2, y2] = vertical ? [x, y - sign * amount / 2, x, y + sign * amount / 2] : [x - sign * amount / 2, y, x + sign * amount / 2, y];
    const clamp = (v, max) => Math.max(5, Math.min(max - 5, Math.round(v)));
    shell(serial, `input swipe ${clamp(x1, w)} ${clamp(y1, h)} ${clamp(x2, w)} ${clamp(y2, h)} ${Number(args.ms ?? 350)}`);
    await sleep(700);
    journal(state, {command: 'scroll', dir, amount, at: [x, y]});
    return {ok: true, scrolled: dir, amount, at: [x, y]};
  },

  async wait(args) {
    const {serial, cdpPort} = target(args, {mutates: false});
    const timeout = Number(args.timeout ?? 10000), until = Date.now() + timeout;
    for (;;) {
      let found = false;
      try {
        const page = await inPage(serial, cdpPort);
        try { found = !(await page.evaluate(`(q) => window.__rpmLocate(q)`, {name: args.name, role: args.role, css: args.css})).error; }
        finally { page.close(); }
      } catch (e) { if (!(e instanceof UserError)) throw e; }
      if (found !== !!args.gone) return {ok: true, [args.gone ? 'gone' : 'found']: args.name ?? args.css, ms: timeout - (until - Date.now())};
      if (Date.now() > until) throw new UserError(`"${args.name ?? args.css}" ${args.gone ? 'still on screen' : 'did not appear'} after ${timeout}ms.`, 'Run `rpmctl ui` and `rpmctl shot` to see the current screen.');
      await sleep(300);
    }
  },

  async display(args) {
    const {serial, state} = target(args, {mutates: true});
    const name = args._[0] === 'reset' ? 'phone' : args._[0];
    const d = DISPLAYS[name];
    if (!d) throw new UserError(`Unknown display "${args._[0] ?? ''}".`, `One of ${Object.keys(DISPLAYS).join(', ')}, reset.`);
    const before = displayInfo(serial);
    shell(serial, `settings put system font_scale ${d.fontScale}`);
    shell(serial, `settings put system user_rotation ${d.rotation}`);
    shell(serial, d.size ? `wm size ${d.size}` : 'wm size reset');
    shell(serial, d.density ? `wm density ${d.density}` : 'wm density reset');
    await sleep(2000);
    const out = {ok: true, display: name, note: d.note, before, after: displayInfo(serial)};
    journal(state, {command: 'display', result: out});
    return out;
  },

  async shot(args) {
    const {serial, state, cdpPort} = target(args, {mutates: false});
    const label = (args._[0] ?? 'screen').replace(/[^\w.-]+/g, '-');
    const dir = evidenceDir(state);
    const n = String(fs.readdirSync(dir).filter(f => /^\d+-.*\.png$/.test(f)).length + 1).padStart(2, '0');
    const png = path.join(dir, `${n}-${label}.png`), json = path.join(dir, `${n}-${label}.json`);
    fs.writeFileSync(png, adb(serial, ['exec-out', 'screencap', '-p'], {binary: true}));
    let page = null;
    try { const p = await inPage(serial, cdpPort); try { page = await p.evaluate(`(all) => window.__rpmSnapshot(all)`, false); } finally { p.close(); } }
    catch (e) { page = {unavailable: e.message}; }
    const meta = {label, at: new Date().toISOString(), serial, activity: foregroundActivity(serial), display: displayInfo(serial), page,
      native: page?.unavailable ? nativeNodes(serial) : undefined};
    fs.writeFileSync(json, JSON.stringify(meta, null, 2));
    journal(state, {command: 'shot', png, json});
    return {ok: true, png, json, activity: meta.activity, url: page?.url, view: page?.view};
  },

  async eval(args) {
    const {serial, cdpPort} = target(args, {mutates: true});
    const page = await inPage(serial, cdpPort);
    try { return {ok: true, value: await page.evaluate(args._.join(' '))}; }
    finally { page.close(); }
  },

  async state(args) {
    const {serial} = target(args, {mutates: false});
    const rel = args._[0];
    if (rel && (rel.includes('..') || rel.startsWith('/'))) throw new UserError('Path must be relative to the app data dir.', 'e.g. rpmctl state files/companion.json');
    if (!rel) return {ok: true, files: adb(serial, ['exec-out', 'run-as', PACKAGE, 'ls', '-laR', 'files', 'shared_prefs', 'databases'], {allowFail: true}).trim().split('\n')};
    const text = adb(serial, ['exec-out', 'run-as', PACKAGE, 'cat', rel]);
    try { return {ok: true, path: rel, json: JSON.parse(text)}; } catch { return {ok: true, path: rel, text: text.slice(0, 200000)}; }
  },

  async logs(args) {
    const {serial, state} = target(args, {mutates: false});
    if (args.errors) return {ok: true, errors: errorLines(serial, state?.appLogSince)};
    const pid = appPid(serial);
    const lines = adb(serial, ['logcat', '-d', '-t', String(Number(args.lines ?? 200)), ...(pid ? ['--pid', pid] : [])], {allowFail: true}).trim().split('\n');
    return {ok: true, pid, lines};
  },

  async scenario(args) {
    const dir = path.join(SKILL, 'scenarios');
    const mods = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".mjs")).sort()) { const m = await import(pathToFileURL(path.join(dir, f)).href); if (m.id && m.run) mods.push(m); }
    if (args.list) return {ok: true, scenarios: mods.map(m => ({id: m.id, rule: m.rule, enforces: m.enforces, knownBug: m.knownBug ?? null}))};
    const wanted = args.all ? mods : mods.filter(m => args._.includes(m.id));
    if (!wanted.length) throw new UserError('No scenario selected.', `Pass --all or ids from \`rpmctl scenario --list\`: ${mods.map(m => m.id).join(', ')}`);
    const {serial, state} = target(args, {mutates: true});
    const results = [];
    for (const m of wanted) {
      const t0 = Date.now(), since = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim(), facts = {}, shots = [];
      const ctx = {
        facts,
        do: async (cmd, ...argv) => {
          const out = await commands[cmd](parseArgs(argv.map(String)));
          if (out.ok === false) throw new ScenarioFailure(`${cmd} ${argv.join(' ')} failed`, out);
          if (cmd === 'shot') shots.push(out.png);
          return out;
        },
        read: async (fn, arg) => { const page = await inPage(serial, Number(state.cdpPort)); try { return await page.evaluate(String(fn), arg ?? null); } finally { page.close(); } },
        store: async () => (await commands.state(parseArgs(['files/companion.json']))).json,
        expect: (condition, message, detail) => { if (!condition) throw new ScenarioFailure(message, detail); },
        shot: label => ctx.do('shot', `${m.id}-${label}`),
      };
      let status = 'pass', failure = null;
      try {
        await m.run(ctx);
        const shown = await ctx.read(() => [...document.querySelectorAll('#snackbar, .sheet-error, .snackbar-text, [role=alert], .error, #status')].filter(n => !n.closest('[hidden]')).map(n => n.textContent).join(' | '));
        ctx.expect(!/Cannot read|TypeError|ReferenceError|is not a function|is not defined|\bundefined\b|\bnull\b/.test(shown), 'A raw script error is on screen', shown);
        const errors = errorLines(serial, since).filter(l => /Uncaught|FATAL EXCEPTION/.test(l));
        ctx.expect(!errors.length, 'The page logged an uncaught error or the app crashed', errors.slice(0, 5));
      } catch (e) {
        status = 'fail';
        failure = {message: e.message, detail: e.detail ?? e.fix ?? e.stack?.split('\n').slice(0, 3)};
        try { await ctx.shot('failure'); } catch {}
      }
      // A known bug only excuses the failure it describes; any other failure still fails the run.
      if (m.knownBug) status = status === 'pass' ? 'known-bug-fixed' : m.knownBug.failsWith.test(failure.message) ? 'known-bug' : 'fail';
      results.push({id: m.id, status, ms: Date.now() - t0, facts, ...(failure ? {failure} : {}), ...(m.knownBug ? {knownBug: m.knownBug} : {}), shots});
    }
    const out = {ok: results.every(r => r.status === 'pass' || r.status === 'known-bug'), results};
    journal(state, {command: 'scenario', result: out});
    return out;
  },

  async check(args) {
    const state = readState();
    const dir = evidenceDir(state);
    const steps = {js: 'test:js', cloud: 'test:cloud', typecheck: 'typecheck:cloud', java: 'test:java', rules: 'check:rules'};
    const wanted = args.only ? String(args.only).split(',') : Object.keys(steps);
    const results = [];
    for (const name of wanted) {
      if (!steps[name]) throw new UserError(`Unknown check "${name}".`, `One of ${Object.keys(steps).join(', ')}.`);
      const t0 = Date.now();
      const r = spawnSync(...viaShell('npm', ['run', '--silent', steps[name]]), {cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024});
      const log = path.join(dir, `check-${name}.log`);
      fs.writeFileSync(log, `$ npm run ${steps[name]}\nexit ${r.status}\n\n${r.stdout}\n${r.stderr}`);
      const summary = (r.stdout + r.stderr).split('\n').filter(l => /^ℹ (tests|pass|fail)|Tests? +\d|PASS:|FAIL|✖|error TS|rule /.test(l)).slice(0, 12);
      results.push({check: name, ok: r.status === 0, seconds: Math.round((Date.now() - t0) / 1000), log, summary});
    }
    const out = {ok: results.every(r => r.ok), results};
    journal(state, {command: 'check', result: out});
    return out;
  },

  async cleanup(args) {
    const state = readState();
    if (!state) return {ok: true, note: 'Nothing launched by rpmctl is running.', evidence: fs.existsSync(EVIDENCE) ? EVIDENCE : null};
    const dir = evidenceDir(state);
    adb(null, ['forward', '--remove', `tcp:${state.cdpPort}`], {allowFail: true});
    let killed = false;
    if (!args.keepEmulator) {
      if (devices().some(d => d.serial === state.serial)) adb(state.serial, ['emu', 'kill'], {allowFail: true});
      await waitFor(() => !processAlive(state.pid), {timeout: 30000, what: 'the emulator to exit'}).catch(() => null);
      killed = killTree(state.pid) || !processAlive(state.pid);
    }
    journal(state, {command: 'cleanup', killedEmulator: killed});
    if (!args.keepEmulator) fs.rmSync(STATE, {force: true});
    return {ok: true, killedEmulatorPid: args.keepEmulator ? null : state.pid, evidence: dir, evidenceFiles: fs.readdirSync(dir).length};
  },
};

class ScenarioFailure extends Error {
  constructor(message, detail) { super(message); this.detail = detail; }
}

function errorLines(serial, since) {
  const pid = appPid(serial);
  const raw = adb(serial, ['logcat', '-d', ...(since ? ['-T', since] : []), '-v', 'threadtime'], {allowFail: true});
  return raw.split('\n').filter(l => /FATAL EXCEPTION|ANR in com\.rpm|AndroidRuntime.*com\.rpm/.test(l)
    || (/chromium/.test(l) && /Uncaught|CONSOLE.*(error|Error)/.test(l))
    || (pid && l.includes(` ${pid} `) && /\sE\s/.test(l) && !/eglCodecCommon|EGL_emulation|HostConnection/.test(l))).slice(-80);
}

const argv = parseArgs(process.argv.slice(2));
const cmd = argv._.shift();
if (!cmd || cmd === 'help' || (argv.help && !commands[cmd])) { console.log(HELP._); process.exit(0); }
if (argv.help) { console.log(HELP[cmd]); process.exit(0); }
if (!commands[cmd]) { console.log(JSON.stringify({ok: false, error: `Unknown command "${cmd}".`, fix: 'Run `rpmctl --help` for the command list.'})); process.exit(1); }
try {
  const out = await commands[cmd](argv);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok === false ? 1 : 0);
} catch (e) {
  console.log(JSON.stringify({ok: false, command: cmd, error: e.message, fix: e.fix ?? `Unexpected failure; rerun with the same arguments, then \`rpmctl doctor\`.`, ...(e.fix ? {} : {stack: e.stack?.split('\n').slice(0, 4)})}, null, 2));
  process.exit(1);
}
