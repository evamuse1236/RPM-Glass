import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LAUNCHER, UserError, adb, devices, waitFor, appPid, ownsEmulator} from './device.mjs';
import {defaultPorts, requireOwner, assertLease} from './ownership.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SKILL, '../../..');
const WORK = path.join(ROOT, '.verify');
const STATE = path.join(WORK, 'state.json');
const EVIDENCE = path.join(WORK, 'evidence');
const APK = path.join(ROOT, 'app/build/outputs/apk/debug/app-debug.apk');
const DEFAULTS = {avd: 'Galaxy_S24_FE_API_36', ...defaultPorts(ROOT), gpu: 'host'};
const DISPLAYS = {
  phone: {fontScale: '1.0', rotation: 0, size: null, density: null, note: 'S24 FE portrait at One UI default: 384dp wide (density 450), 100% text'},
  landscape: {fontScale: '1.0', rotation: 1, size: null, density: null, note: 'S24 FE rotated'},
  wide: {fontScale: '1.0', rotation: 0, size: '1600x2560', density: 320, note: '800dp-wide tablet/unfolded width'},
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
const writeState = s => {
  fs.mkdirSync(WORK, {recursive: true});
  const temporary = `${STATE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(s, null, 2));
  fs.renameSync(temporary, STATE);
};

function evidenceDir(state) {
  const dir = path.join(EVIDENCE, state?.runId ?? `adhoc-${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}
function journal(state, entry) {
  fs.appendFileSync(path.join(evidenceDir(state), 'journal.jsonl'), JSON.stringify({at: new Date().toISOString(), ...entry}) + '\n');
}

// Resolves which device a command targets and whether it may change it.
// A device rpmctl did not launch gets its own DevTools port, derived from its serial, never the owned emulator's.
function devtoolsPort(serial, args) {
  const port = Number(args.cdpPort ?? 9400 + [...serial].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 500, 0));
  if (port === (readState()?.cdpPort ?? DEFAULTS.cdpPort)) throw new UserError(`Port ${port} belongs to the emulator rpmctl launched.`, 'Pick another --cdp-port for this device, or drop it.');
  return port;
}

function target(args, {mutates}) {
  const state = readState();
  if (mutates) { requireOwner(state, args); if (state) assertLease(state); }
  const serial = args.serial ?? state?.serial;
  if (!serial) throw new UserError('No emulator launched by rpmctl.', 'Run `rpmctl launch` (or pass --serial for a read-only look at another device).');
  const owned = !!state && state.serial === serial && devices().some(d => d.serial === serial && d.state === 'device') && ownsEmulator(state, serial);
  if (mutates && !owned) throw new UserError(`${serial} was not launched or explicitly adopted by rpmctl (or its emulator has exited); refusing to change it.`,
    args.serial ? 'Mutating commands only run on the owned emulator. Drop --serial, or use doctor/ui/shot/logs/state for read-only checks.' : 'Run `rpmctl launch`.');
  if (!devices().some(d => d.serial === serial && d.state === 'device')) throw new UserError(`${serial} is not online in adb.`, owned ? 'Run `rpmctl doctor`; if the emulator hung, `rpmctl cleanup` then `rpmctl launch`.' : 'Connect the device and check `adb devices`.');
  // Each device gets its own DevTools port, so a read-only look at a phone can never redirect a command meant for the emulator.
  if (owned && args.cdpPort !== undefined && Number(args.cdpPort) !== state.cdpPort)
    throw new UserError('This run leased a different CDP port.', 'Use the CDP port selected at launch; cleanup before changing --cdp-port.');
  return {serial, state: owned ? state : null, cdpPort: owned ? state.cdpPort : devtoolsPort(serial, args)};
}

// .bat and .cmd launchers (gradlew.bat, npm.cmd) need cmd.exe on Windows.
const viaShell = (cmd, args) => process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', cmd, ...args]] : [cmd, args];

async function openLauncher(serial, action) {
  const args = ['am', 'start', '-W', '-n', LAUNCHER];
  if (action) args.push('-a', action); else args.push('-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER');
  adb(serial, ['shell', ...args], {timeout: 60000});
  await waitFor(() => appPid(serial), {timeout: 30000, what: 'the app process'});
}


function errorLines(serial, since) {
  const pid = appPid(serial);
  const raw = adb(serial, ['logcat', '-d', ...(since ? ['-T', since] : []), '-v', 'threadtime'], {allowFail: true});
  const lines = raw.split('\n');
  // A crash counts only when its "Process:" line names RPM; other apps crashing on a slow emulator are not RPM's failure.
  const rpmCrash = i => /FATAL EXCEPTION/.test(lines[i]) && lines.slice(i + 1, i + 4).some(l => /Process: com\.rpm\.prototype\b/.test(l));
  // Keep a crash's whole stack: the AndroidRuntime lines from the crashing pid after "FATAL EXCEPTION".
  const crashPids = new Set(lines.map((l, i) => rpmCrash(i) ? l.trim().split(/\s+/)[2] : null).filter(Boolean));
  const inCrash = l => /AndroidRuntime/.test(l) && crashPids.has(l.trim().split(/\s+/)[2]);
  // Process deaths without a Java crash: the WebView renderer dying, or Android reclaiming memory.
  const silentDeath = l => /Render process .*(crash|gone|killed)|renderer.*(crash|gone)/i.test(l) && /chromium|cr_|WebView/i.test(l)
    || /(lowmemorykiller|ActivityManager).*(Kill|kill).*com\.rpm\.prototype|Process com\.rpm\.prototype .* has died/.test(l) && !/stop com\.rpm\.prototype due to/.test(l);
  return lines.filter((l, i) => rpmCrash(i) || inCrash(l) || silentDeath(l) || /ANR in com\.rpm/.test(l)
    || (/chromium/.test(l) && /Uncaught|CONSOLE.*(error|Error)/.test(l))
    || (pid && l.includes(` ${pid} `) && /\sE\s/.test(l) && !/eglCodecCommon|EGL_emulation|HostConnection|ashmem|MESA|Frame latency is negative|simple_file_enumerator|simple_index_file/.test(l))).slice(-120);
}

export {SKILL, ROOT, WORK, STATE, EVIDENCE, APK, DEFAULTS, DISPLAYS, parseArgs, readState, writeState, evidenceDir, journal, devtoolsPort, target, viaShell, openLauncher, errorLines};
