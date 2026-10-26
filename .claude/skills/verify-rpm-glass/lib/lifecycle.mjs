import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {PACKAGE, UserError, adb, shell, devices, startEmulator, startNetsim, processAlive, killTree, sleep, waitFor, appPid, foregroundActivity, displayInfo, nativeNodes, dismissAnr, spawnReaper, sdkRoot, processImage, ownsEmulator, adoptEmulator} from './device.mjs';
import {pageTargets} from './page.mjs';
import {builtAssetsSha, clearSynced} from './sync.mjs';
import {gradleVersion, newestSource, apkStale, signer, build} from './apk-build.mjs';
import {ROOT, WORK, STATE, EVIDENCE, APK, DEFAULTS, readState, writeState, evidenceDir, apkCheckout, journal, devtoolsPort, openLauncher, errorLines} from './runtime.mjs';
import {portsFor, requireOwner, takeLease, updateLease, assertLease, releaseLease, readEmulator, saveEmulator, dropEmulator, IDLE_MS} from './ownership.mjs';

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
function installedApk(serial) {
  const remotePath = shell(serial, `pm path ${PACKAGE}`, {allowFail: true}).match(/package:(\S+base\.apk)/)?.[1];
  return remotePath ? adb(serial, ['exec-out', 'cat', remotePath], {binary: true}) : null;
}
const installedApkSha = serial => { const bytes = installedApk(serial); return bytes ? sha256(bytes) : null; };

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

async function queueForLease(leaseState, args) {
  const until = Date.now() + (args.wait === true ? 900 : Number(args.wait)) * 1000;
  for (;;) {
    await sleep(15000);
    try { return takeLease(leaseState); }
    catch (e) {
      if (!/lease is busy/.test(e.message) || Date.now() >= until) throw e;
      console.error(`${e.message} Waiting in the queue.`);
    }
  }
}

const isEmulator = pid => /emulator|qemu/i.test(processImage(pid) ?? '');

function warmEmulator(port, serial) {
  const record = readEmulator(port);
  if (!record) return null;
  const online = devices().some(d => d.serial === serial && d.state === 'device');
  if (online && ownsEmulator({serial, pid: record.pid, avd: record.avd}, serial)) return record;
  if (!isEmulator(record.pid)) dropEmulator(port);
  return null;
}

function keepWarm(state) {
  fs.rmSync(STATE, {force: true});
  releaseLease(state);
  const shared = readEmulator(state.port);
  if (shared?.pid !== state.pid) return;
  const reaperPid = processAlive(shared.reaperPid) ? shared.reaperPid : spawnReaper(state.port);
  saveEmulator(state.port, {...shared, releasedAt: new Date().toISOString(), reaperPid});
}

function handOver(serial) {
  shell(serial, `am force-stop ${PACKAGE}`, {allowFail: true});
  if (shell(serial, `pm path ${PACKAGE}`, {allowFail: true}).includes('package:'))
    adb(serial, ['shell', `run-as ${PACKAGE} sh -c 'rm -rf files shared_prefs databases app_webview cache; mkdir -p files'`], {allowFail: true});
  clearSynced(serial);
  for (const command of ['settings put system font_scale 1.0', 'settings put system user_rotation 0', 'wm size reset', 'wm density reset'])
    shell(serial, command, {allowFail: true});
}

export const lifecycleCommands = {
  async launch(args) {
    let state = readState();
    requireOwner(state, args);
    const attached = args.attach === undefined ? null : adoptEmulator(args.attach);
    if (attached && (args.port !== undefined && Number(args.port) !== attached.port || args.avd !== undefined && args.avd !== attached.avd))
      throw new UserError('Attach conflicts with --port or --avd.', 'Use the serial and AVD started by the runner.');
    if (state && attached && (state.mode !== 'attached' || state.pid !== attached.pid || state.processStarted !== attached.started))
      throw new UserError('A different rpmctl run is already recorded.', 'Run cleanup with its owner before attaching another emulator.');
    const {port, cdpPort} = portsFor({...args, ...(attached ? {port: attached.port} : {})}, state ?? DEFAULTS), serial = `emulator-${port}`;
    if (state && (state.port !== port || state.cdpPort !== cdpPort))
      throw new UserError('This worktree already has a run with different ports.', 'Run `rpmctl cleanup` with its owner token before changing --port or --cdp-port.');
    const t0 = Date.now();
    const startedAt = new Date().toISOString();
    const apk = args.apk ? path.resolve(String(args.apk)) : APK;
    const leaseState = {...state, port, cdpPort, worktree: ROOT,
      owner: state && /emulator|qemu/i.test(processImage(state.pid) ?? '') ? state.owner ?? crypto.randomUUID() : crypto.randomUUID(),
      startedAt: state?.startedAt ?? startedAt, appCheckout: apkCheckout(apk)};
    if (!args.apk && (args.build || (!args.noBuild && apkStale()))) build();
    try { takeLease(leaseState); }
    catch (e) { if (!args.wait || !/lease is busy/.test(e.message)) throw e; await queueForLease(leaseState, args); }
    let emulator = "kept this run's emulator";
    try {
      if (state && !(state.serial === serial && ownsEmulator(state, serial))) {
        if (isEmulator(state.pid)) throw new UserError(`An rpmctl emulator is already running as ${state.serial}.`, 'Use it (drop --port), or run `rpmctl cleanup` first.');
        fs.rmSync(STATE, {force: true}); state = null;
      }
      const lastDriver = state?.shared ? readEmulator(port)?.owner : null;
      if (lastDriver && lastDriver !== state.owner) { fs.rmSync(STATE, {force: true}); state = null; }
      const warm = state || attached ? null : warmEmulator(port, serial);
      if (warm) {
        const runId = `${startedAt.replace(/[:.]/g, '-').slice(0, 19)}-${crypto.randomBytes(3).toString('hex')}`;
        state = {...leaseState, pid: warm.pid, serial, avd: warm.avd, emulatorArgs: warm.emulatorArgs, runId, shared: true,
          installedSha256: warm.installedSha256, webSha256: warm.webSha256};
        writeState(state);
        updateLease(state, {launching: true});
        handOver(serial);
        emulator = `reused the warm emulator booted ${warm.bootedAt}; app data wiped for this run`;
      } else if (!state) {
        if (!attached && devices().some(d => d.serial === serial)) throw new UserError(`${serial} is already running and was not started by rpmctl.`, `Pick a free port: rpmctl launch --port ${port + 10}. Never drive an instance you did not start or explicitly adopt.`);
        const runId = `${startedAt.replace(/[:.]/g, '-').slice(0, 19)}-${crypto.randomBytes(3).toString('hex')}`;
        state = {...leaseState, pid: undefined, serial, avd: args.avd ?? DEFAULTS.avd, runId, shared: !attached};
        const log = path.join(evidenceDir(state), 'emulator.log');
        if (attached) Object.assign(state, {mode: 'attached', pid: attached.pid, avd: attached.avd, processStarted: attached.started, emulatorArgs: ['-read-only']});
        else {
          startNetsim();
          const {pid, args: emuArgs} = startEmulator({avd: state.avd, port, logFile: log, gpu: args.gpu ?? DEFAULTS.gpu});
          Object.assign(state, {pid, emulatorArgs: emuArgs});
        }
        const {pid} = state;
        if (!pid) throw new UserError('The emulator process did not start.', 'Check the emulator log, then retry `rpmctl launch`.');
        writeState(state);
        updateLease(state, {launching: true});
        await waitFor(() => devices().some(d => d.serial === serial && d.state === 'device'), {timeout: Number(args.timeout ?? 240) * 1000, what: `${serial} to come online (see ${log})`});
        await waitFor(() => shell(serial, 'getprop sys.boot_completed', {allowFail: true}).trim() === '1', {timeout: Number(args.timeout ?? 240) * 1000, what: 'Android to finish booting'});
        shell(serial, 'input keyevent 82', {allowFail: true});
        shell(serial, 'settings put global stay_on_while_plugged_in 7', {allowFail: true});
        shell(serial, 'settings put system accelerometer_rotation 0', {allowFail: true});
        if (!attached) saveEmulator(port, {pid: state.pid, serial, port, avd: state.avd, emulatorArgs: state.emulatorArgs, bootedAt: new Date().toISOString(), bootedBy: ROOT});
        emulator = 'booted';
      } else { Object.assign(state, leaseState); writeState(state); }
      if (!fs.existsSync(apk)) throw new UserError(`No APK at ${apk}.`, 'Run `rpmctl launch --build`.');
      const apkHash = sha256(fs.readFileSync(apk));
      const installed = shell(serial, `pm path ${PACKAGE}`, {allowFail: true}).includes('package:');
      const installResult = args.noInstall ? (installed ? 'skipped (kept what the emulator had)' : 'skipped (not installed)')
        : installedApkSha(serial) === apkHash ? 'already-installed' : install(serial, apk);
      if (!args.noInstall && installResult !== 'already-installed') { clearSynced(serial); state.webSha256 = builtAssetsSha(state.appCheckout ?? ROOT); }
      if (!args.noInstall) state.installedSha256 = apkHash;
      state.syncedAt = null;
      const shared = readEmulator(port);
      if (shared?.pid === state.pid) saveEmulator(port, {...shared, installedSha256: state.installedSha256, webSha256: state.webSha256, owner: state.owner, releasedAt: null});
      state.appLogSince = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim();
      writeState(state);
      dismissAnr(serial);
      await openLauncher(serial);
      await sleep(2500);
      const anr = dismissAnr(serial);
      const out = {ok: true, serial, pid: state.pid, owner: state.owner, port, cdpPort, runId: state.runId, emulator, evidence: evidenceDir(state), install: installResult,
        apk: {path: path.relative(ROOT, apk), ...(args.apk ? {} : gradleVersion()), sha256: apkHash}, dismissedAnr: anr, seconds: Math.round((Date.now() - t0) / 1000),
        next: 'rpmctl doctor'};
      journal(state, {command: 'launch', result: out});
      return out;
    } catch (error) {
      const saved = readState();
      if (saved?.shared && saved.owner === leaseState.owner && readEmulator(port)?.pid === saved.pid && processAlive(saved.pid)) {
        journal(saved, {command: 'launch', failed: error.message, keptWarm: true});
        keepWarm(saved);
      }
      throw error;
    } finally {
      const saved = readState();
      if (saved?.owner === leaseState.owner) updateLease(saved);
      else releaseLease(leaseState);
    }
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
      const installedBytes = installedApk(serial);
      const remote = installedBytes ? sha256(installedBytes) : null;
      add('installed-apk-matches-local-build', local === remote, {local: local.slice(0, 16), installed: remote?.slice(0, 16)}, owned ? 'The device runs a different build. `rpmctl launch` installs the local one.' : 'The phone runs a different build than this checkout. Compare branch, working tree and installed version before any release (AGENTS.md).');
      if (installedBytes) {
        const pulled = path.join(WORK, 'installed-base.apk');
        fs.mkdirSync(WORK, {recursive: true});
        fs.writeFileSync(pulled, installedBytes);
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
        const pages = await pageTargets(serial, owned ? state.cdpPort : devtoolsPort(serial, args));
        add('webview-devtools', true, pages.map(p => ({title: p.title, url: p.url, visible: p.view.visible})));
      } catch (e) { add('webview-devtools', false, e.message, e.fix); }
    }
    const anr = nativeNodes(serial).some(n => /isn.t responding/i.test(n.text ?? ''));
    add('no-anr-prompt', !anr, anr ? 'a System UI / app not responding prompt is on screen' : 'none', owned ? '`rpmctl tap --native Wait`, then retry.' : 'Dismiss it on the device.');
    // A crash fails only when RPM's own code is in the stack. A cold boot can start the image's old copy of the app
    // while launch replaces it, and Android then crashes inside its own start-up code; that is reported, not failed.
    const crashLines = errorLines(serial, owned ? state.appLogSince : null).filter(l => /AndroidRuntime|ANR in com\.rpm/.test(l));
    const rpmCode = crashLines.some(l => /\bat com\.rpm\.|ANR in com\.rpm/.test(l));
    add('no-app-crash', !rpmCode, rpmCode ? crashLines.slice(0, 14)
      : crashLines.length ? {platformOnly: crashLines.filter(l => /Exception|Process:/.test(l)).slice(0, 6), note: 'Android crashed while starting the process; no RPM code in the stack'} : 'no RPM crash or ANR since launch',
      'Read `rpmctl logs --errors` for the stack.');
    const failed = checks.filter(c => !c.ok);
    return {ok: !failed.length, ...(failed.length ? {firstFix: failed[0].fix} : {}), checks};
  },

  async cleanup(args) {
    const state = readState();
    if (!state) return {ok: true, note: 'Nothing launched by rpmctl is running.', evidence: fs.existsSync(EVIDENCE) ? EVIDENCE : null};
    requireOwner(state, args);
    assertLease(state);
    const dir = evidenceDir(state);
    adb(null, ['forward', '--remove', `tcp:${state.cdpPort}`], {allowFail: true});
    const shared = readEmulator(state.port);
    const ownsShared = shared?.pid === state.pid;
    if (state.shared && !args.stop && !args.keepEmulator) {
      journal(state, {command: 'cleanup', keptWarm: true});
      keepWarm(state);
      return {ok: true, emulator: `kept warm for the next run on ${state.serial}; it stops after ${IDLE_MS / 60000} min with no run (\`rpmctl cleanup --stop\` stops it now)`,
        evidence: dir, evidenceFiles: fs.readdirSync(dir).length};
    }
    let killed = false;
    if (!args.keepEmulator && state.mode !== 'attached') {
      const ours = /emulator|qemu/i.test(processImage(state.pid) ?? '');
      if (ours && devices().some(d => d.serial === state.serial) && ownsEmulator(state)) adb(state.serial, ['emu', 'kill'], {allowFail: true});
      if (ours) {
        await waitFor(() => !processAlive(state.pid), {timeout: 30000, what: 'the emulator to exit'}).catch(() => null);
        if (/emulator|qemu/i.test(processImage(state.pid) ?? '')) killTree(state.pid);
      }
      killed = ours && !processAlive(state.pid);
    }
    journal(state, {command: 'cleanup', killedEmulator: killed});
    if (!args.keepEmulator) {
      if (state.mode !== 'attached' && processAlive(state.pid) && /emulator|qemu/i.test(processImage(state.pid) ?? ''))
        throw new UserError('The emulator is still running; its lease and state were kept.', 'Retry `rpmctl cleanup` with the same owner token.');
      fs.rmSync(STATE, {force: true});
      releaseLease(state);
      if (ownsShared) dropEmulator(state.port);
    }
    return {ok: true, emulator: args.keepEmulator ? 'kept' : state.mode === 'attached' ? 'detached (runner stops it)' : killed ? `stopped pid ${state.pid}` : 'already gone (nothing killed)', evidence: dir, evidenceFiles: fs.readdirSync(dir).length};
  },
};
