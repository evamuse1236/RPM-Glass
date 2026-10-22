import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

export const PACKAGE = 'com.rpm.prototype';
export const LAUNCHER = `${PACKAGE}/.CompanionActivity`;

export class UserError extends Error {
  constructor(message, fix) { super(message); this.fix = fix; }
}

export function sdkRoot() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'AppData/Local/Android/Sdk'), path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')];
  const found = candidates.find(dir => dir && fs.existsSync(path.join(dir, 'platform-tools')));
  if (!found) throw new UserError('Android SDK not found.', 'Set ANDROID_HOME to the SDK folder (the one containing platform-tools/ and emulator/).');
  return found;
}

const exe = name => process.platform === 'win32' ? name + '.exe' : name;
export const adbPath = () => path.join(sdkRoot(), 'platform-tools', exe('adb'));
export const emulatorPath = () => path.join(sdkRoot(), 'emulator', exe('emulator'));

// Runs adb with an argument array (never through a shell on the host side), so no quoting or MSYS path rewriting applies.
export function adb(serial, args, {binary = false, allowFail = false, timeout = 60000, input} = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  const r = spawnSync(adbPath(), full, {encoding: binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, timeout, input, windowsHide: true});
  if (r.error) throw new UserError(`adb ${full.join(' ')} failed: ${r.error.message}`, 'Check that adb works: run `adb devices`.');
  if (r.status !== 0 && !allowFail) {
    const err = (binary ? r.stderr.toString() : r.stderr) || (binary ? '' : r.stdout);
    throw new UserError(`adb ${full.join(' ')} exited ${r.status}: ${String(err).trim().slice(0, 600)}`, 'Run `doctor` to see which part of the setup is broken.');
  }
  return binary ? r.stdout : ((r.stdout ?? '') + (r.status !== 0 ? r.stderr ?? '' : '')).replace(/\r\n/g, '\n');
}

export const shell = (serial, command, options) => adb(serial, ['shell', command], options);

export function devices() {
  return adb(null, ['devices', '-l']).split('\n').slice(1).filter(Boolean).map(line => {
    const [serial, state, ...rest] = line.trim().split(/\s+/);
    return {serial, state, detail: rest.join(' ')};
  });
}

/** On Windows the emulator starts netsimd itself, which opens a console window. Starting it first, with no console, lets the emulator reuse it. */
export function netsimToStart({platform = process.platform, exe, running}) {
  return platform === 'win32' && !!exe && !running;
}

const netsimRunning = () => spawnSync('tasklist', ['/FI', 'IMAGENAME eq netsimd.exe', '/FO', 'CSV', '/NH'], {encoding: 'utf8', windowsHide: true}).stdout?.includes('netsimd.exe');

export function startNetsim() {
  const exe = path.join(path.dirname(emulatorPath()), 'netsimd.exe');
  if (!netsimToStart({exe: fs.existsSync(exe) ? exe : null, running: process.platform === 'win32' && netsimRunning()})) return null;
  const ini = path.join(os.tmpdir(), 'netsim.ini');
  const before = fs.existsSync(ini) ? fs.statSync(ini).mtimeMs : 0;
  const child = spawn(exe, [], {detached: true, stdio: 'ignore', windowsHide: true});
  child.unref();
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (const until = Date.now() + 10000; Date.now() < until; Atomics.wait(pause, 0, 0, 200)) {
    if (fs.existsSync(ini) && fs.statSync(ini).mtimeMs > before) return child.pid;
  }
  return child.pid;
}

/** Software rendering scrolled Settings at 8.2 CPU cores against 0.68 with the host GPU (2026-10-20). The emulator prints "Your GPU cannot be used" even when the host GPU works. */
export function gpuMode(requested = 'host', env = process.env) {
  if (!/swiftshader|guest|software/i.test(requested) || env.RPM_ALLOW_SOFTWARE_GPU === '1') return requested;
  throw new UserError(`--gpu ${requested} draws on the CPU and uses about 12x more CPU than the host GPU.`,
    'Drop --gpu. The startup line "Your GPU cannot be used for hardware rendering" is harmless when the screen draws. If the host-GPU emulator stays black, crashes, or goes offline (log: "error null ctx"), relaunch with RPM_ALLOW_SOFTWARE_GPU=1 and say so in the reply.');
}

export function emulatorEnv(env = process.env, home = os.homedir(), platform = process.platform) {
  if (env.ANDROID_TMP || platform === 'win32') return env;
  return {...env, ANDROID_TMP: path.join(home, '.cache', 'android-tmp')};
}

const qemuRunning = () => process.platform !== 'linux' || fs.readdirSync('/proc').some(p => /^\d+$/.test(p) && (() => { try { return fs.readFileSync(`/proc/${p}/comm`, 'utf8').startsWith('qemu-system'); } catch { return false; } })());

/** Overlays left by an emulator that crashed; a clean exit deletes its own. Only rpmctl's folder, and only when no emulator runs. */
export function staleOverlays(dir, {emulatorRunning}) {
  if (emulatorRunning || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^emulator-\w+\.qcow2$/.test(f)).map(f => path.join(dir, f));
}

export function startEmulator({avd, port, logFile, gpu}) {
  const args = ['-avd', avd, '-port', String(port), '-read-only', '-no-window', '-no-audio', '-no-boot-anim', '-gpu', gpuMode(gpu), '-no-snapshot-save'];
  const log = fs.openSync(logFile, 'a');
  const env = emulatorEnv();
  if (env.ANDROID_TMP) fs.mkdirSync(env.ANDROID_TMP, {recursive: true});
  if (env.ANDROID_TMP && !process.env.ANDROID_TMP) for (const f of staleOverlays(env.ANDROID_TMP, {emulatorRunning: qemuRunning()})) fs.rmSync(f, {force: true});
  const child = spawn(emulatorPath(), args, {detached: true, stdio: ['ignore', log, log], windowsHide: true, env});
  child.unref();
  return {pid: child.pid, args};
}

/** Starts the detached watcher that stops the shared emulator once no run has used it for the idle time. */
export function spawnReaper(port) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reaper.mjs');
  const child = spawn(process.execPath, [script, String(port)], {detached: true, stdio: 'ignore', windowsHide: true});
  child.unref();
  return child.pid;
}

export function processAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export function killTree(pid) {
  if (!processAlive(pid)) return false;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {windowsHide: true});
  else try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
  return true;
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function waitFor(check, {timeout, every = 1000, what}) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new UserError(`Timed out after ${Math.round(timeout / 1000)}s waiting for ${what}.`, 'Run `doctor`, and `logs --errors` for crashes. Raise --timeout if the machine is slow.');
    await sleep(every);
  }
}

export function appPid(serial) {
  return shell(serial, `pidof ${PACKAGE}`, {allowFail: true}).trim().split(/\s+/)[0] || null;
}

export function foregroundActivity(serial) {
  const out = shell(serial, 'dumpsys activity activities', {allowFail: true});
  return out.match(/topResumedActivity[^\n]*?\{[^}]*?\s(\S+\/\S+)/)?.[1] ?? out.match(/mResumedActivity[^\n]*?\s(\S+\/\S+)/)?.[1] ?? null;
}

export function displayInfo(serial) {
  const size = shell(serial, 'wm size', {allowFail: true}).match(/(Override|Physical) size: (\d+)x(\d+)/g) ?? [];
  const density = shell(serial, 'wm density', {allowFail: true}).match(/(\d+)\s*$/m)?.[1];
  const fontScale = shell(serial, 'settings get system font_scale', {allowFail: true}).trim();
  const rotation = shell(serial, 'settings get system user_rotation', {allowFail: true}).trim();
  return {size: size.at(-1)?.replace(/.*: /, '') ?? null, density: Number(density), fontScale: fontScale === 'null' ? '1.0' : fontScale, rotation: rotation === 'null' ? '0' : rotation};
}

// uiautomator sees the native view tree (system dialogs, native activities, the launcher) and the WebView's accessibility nodes.
export function nativeNodes(serial) {
  shell(serial, 'uiautomator dump /sdcard/rpm-verify-ui.xml', {allowFail: true});
  const xml = adb(serial, ['exec-out', 'cat', '/sdcard/rpm-verify-ui.xml'], {allowFail: true});
  const nodes = [];
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const attr = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], decode(a[2])]));
    const b = attr.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    if (!attr.text && !attr['content-desc'] && !attr['resource-id']) continue;
    nodes.push({text: attr.text, desc: attr['content-desc'], id: attr['resource-id'], cls: attr.class, pkg: attr.package,
      clickable: attr.clickable === 'true', bounds: [x1, y1, x2, y2], center: [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)]});
  }
  return nodes;
}
const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

// The software-rendered emulator sometimes stalls System UI long enough for an ANR prompt; "Wait" is the harmless answer.
export function dismissAnr(serial) {
  const nodes = nativeNodes(serial);
  if (!nodes.some(n => /isn.t responding/i.test(n.text ?? ''))) return false;
  const wait = nodes.find(n => n.text === 'Wait');
  if (wait) shell(serial, `input tap ${wait.center[0]} ${wait.center[1]}`);
  return true;
}

export function processImage(pid) {
  if (!processAlive(pid)) return null;
  if (process.platform === 'win32') {
    const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {encoding: 'utf8', windowsHide: true});
    return r.stdout?.match(/^"([^"]+)","(\d+)"/m)?.[2] === String(pid) ? r.stdout.match(/^"([^"]+)"/m)[1] : null;
  }
  try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { return spawnSync('ps', ['-p', String(pid), '-o', 'comm='], {encoding: 'utf8'}).stdout?.trim() || null; }
}

export const avdName = serial => adb(serial, ['emu', 'avd', 'name'], {allowFail: true, timeout: 10000}).split('\n')[0].trim();

export function attachedProcess(pid, {proc = '/proc'} = {}) {
  try {
    const args = fs.readFileSync(path.join(proc, String(pid), 'cmdline'), 'utf8').split('\0').filter(Boolean);
    const stat = fs.readFileSync(path.join(proc, String(pid), 'stat'), 'utf8');
    const started = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    const port = args[args.indexOf('-port') + 1];
    const avd = args.includes('-avd') ? args[args.indexOf('-avd') + 1] : args.find(a => a.startsWith('@'))?.slice(1);
    if (!/emulator|qemu/i.test(path.basename(args[0] ?? '')) || !args.includes('-read-only') || !started || !avd || !/^\d+$/.test(port ?? '')) return null;
    return {pid: Number(pid), port: Number(port), avd, started};
  } catch { return null; }
}

export function adoptEmulator(serial, {platform = process.platform, proc = '/proc', list = devices, name = avdName} = {}) {
  if (platform !== 'linux' || !/^emulator-\d+$/.test(serial ?? ''))
    throw new UserError('Attach needs a Linux emulator serial such as emulator-5554.', 'Use --attach emulator-5554 on the CI runner; use normal launch on Windows.');
  const port = Number(serial.slice('emulator-'.length));
  if (!list().some(d => d.serial === serial && d.state === 'device'))
    throw new UserError(`${serial} is not online.`, 'Start the CI emulator before attaching.');
  const matches = fs.readdirSync(proc).filter(p => /^\d+$/.test(p)).map(pid => attachedProcess(pid, {proc})).filter(p => p?.port === port);
  if (matches.length !== 1 || matches[0].avd !== name(serial))
    throw new UserError(`Cannot identify one read-only emulator process for ${serial}.`, 'Start the runner emulator with -port, -read-only, and an explicit AVD.');
  return matches[0];
}

// The recorded pid must still be an emulator process (pids get reused) and the serial must be running the AVD it booted.
export function ownsEmulator(state, serial = state?.serial) {
  if (!state || state.serial !== serial) return false;
  if (state.mode === 'attached') {
    const current = attachedProcess(state.pid);
    if (!current || current.started !== state.processStarted || current.port !== state.port || current.avd !== state.avd) return false;
  }
  if (!/emulator|qemu/i.test(processImage(state.pid) ?? '')) return false;
  return avdName(serial) === state.avd;
}
