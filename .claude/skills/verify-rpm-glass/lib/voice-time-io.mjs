import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PACKAGE, UserError, adb, shell, sleep, waitFor, foregroundActivity, dismissAnr} from './device.mjs';
import {inPage} from './page.mjs';
import {driveCommands} from './drive.mjs';
import {target, openLauncher, errorLines, readState} from './runtime.mjs';
import {RUN_DIR, armExpression, isEmulatorDevice, loadVoiceFixtures, parseVoiceTimeArgs, runVoiceTimes} from './voice-time.mjs';

function prefsXml({fixture, delay}) {
  const rows = ['<boolean name="RPM_VOICE_TIMING" value="true" />'];
  if (fixture) rows.push(`<string name="RPM_FAKE_MIC">${fixture}</string>`);
  if (delay) rows.push(`<string name="RPM_VOICE_DELAY">${delay.replace(/[<>&]/g, '')}</string>`);
  return `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n${rows.join('\n')}\n</map>\n`;
}

const hasMark = name => `performance.getEntriesByType('mark').some(entry => entry.name==='voice:${name}')`;

/** Reads of the visible page and the log. None of them changes the device. */
function pageReads(serial, cdpPort, sinceRef) {
  const pageEval = async expression => {
    const page = await inPage(serial, cdpPort);
    try { return await page.evaluate(expression); }
    finally { page.close(); }
  };
  const until = (expression, {timeout, what}) => waitFor(async () => {
    try { return (await pageEval(expression)) === true; }
    catch (e) { if (e instanceof UserError) return false; throw e; }
  }, {timeout, every: 300, what});
  return {
    pageEval,
    until,
    capturePage: what => until(`document.readyState==='complete'&&!!document.querySelector('#message')`, {timeout: 45000, what}),
    now: () => Date.now(),
    sleep,
    async waitForStage(name, {timeout = 120000} = {}) { await until(hasMark(name), {timeout, what: `voice stage ${name}`}); },
    readMarks: () => pageEval(`performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('voice:')).map(entry => ({name: entry.name, startTime: entry.startTime}))`),
    readClock: () => pageEval(`({timeOrigin: performance.timeOrigin, pageNow: Date.now()})`),
    readLog: () => adb(serial, ['logcat', '-d', '-t', '400'], {allowFail: true}),
    /** Per request n (index n - 1): the text of the call table's rows that request changed, or null. */
    async readReceipts() {
      try {
        return await pageEval(`(() => { const by = {}; for (const row of document.querySelectorAll('.voice-call .voice-row')) for (const n of row.dataset.requests.split(' ')) (by[n] ??= []).push(row.innerText); const last = Math.max(0, ...Object.keys(by).map(Number)); return Array.from({length: last}, (_, i) => by[i + 1]?.join(' | ') ?? null); })()`);
      } catch { return []; }
    },
    async countLogErrors() {
      try { return errorLines(serial, sinceRef.at).length; } catch { return 0; }
    },
    async writeRun(run) {
      fs.mkdirSync(RUN_DIR, {recursive: true});
      const file = path.join(RUN_DIR, `${run.runId}.json`);
      fs.writeFileSync(file, JSON.stringify(run, null, 2));
      run.file = file;
    },
  };
}

/**
 * A phone: read-only target, real mic, the person's own plan. It never force-stops (that would drop the phone's
 * reminder alarms), never writes prefs or the store, and never taps Hang up: the person ends the call.
 */
function phoneVoiceTimeIo(argv) {
  const {serial, cdpPort} = target(argv, {mutates: false});
  const since = {at: null};
  const reads = pageReads(serial, cdpPort, since);
  return {
    ...reads,
    fixtures: [],
    async openVoice() {
      since.at = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim();
      const t0 = Date.now();
      await openLauncher(serial, 'com.rpm.widget.voice');
      await reads.capturePage('Capture to open for voice-time');
      await reads.pageEval('window.__rpmVoiceTiming=true;true');
      await reads.until(`${hasMark('T2')}&&!${hasMark('T10')}`, {timeout: 30000, what: 'a new voice session to start'});
      return t0;
    },
    async describeDevice() {
      const version = /versionName=(\S+)/.exec(shell(serial, `dumpsys package ${PACKAGE}`))?.[1] ?? null;
      return {buildHash: version, device: serial, networkType: null};
    },
  };
}

/** The emulator rpmctl owns: it may reset the plan, arm the fake mic and tap Hang up. */
function emulatorVoiceTimeIo(argv, fixtures) {
  const {serial, cdpPort} = target(argv, {mutates: true});
  const since = {at: null};
  const reads = pageReads(serial, cdpPort, since);
  let minted = false;
  let storeFile = null;
  const storeData = async () => {
    if (storeFile) return storeFile;
    const data = argv.store && argv.store !== true && argv.store !== 'seed'
      ? JSON.parse(fs.readFileSync(String(argv.store), 'utf8'))
      : (await import(new URL('../../../../scripts/gauntlet/seed.mjs', import.meta.url))).seedStore(new Date()).data;
    storeFile = path.join(os.tmpdir(), `rpm-voice-store-${process.pid}.json`);
    fs.writeFileSync(storeFile, JSON.stringify(data));
    return storeFile;
  };
  const putStore = async () => {
    adb(serial, ['push', await storeData(), '/data/local/tmp/rpm-voice-store.json']);
    adb(serial, ['shell', 'run-as', PACKAGE, 'cp', '/data/local/tmp/rpm-voice-store.json', 'files/companion.json']);
  };
  return {
    ...reads,
    fixtures,
    async openVoice({fixture, human}) {
      if (minted) await sleep(3500);
      minted = true;
      since.at = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim();
      dismissAnr(serial);
      const xml = prefsXml({fixture: human ? '' : fixture.id, delay: ''});
      const local = path.join(os.tmpdir(), `rpm-voice-${process.pid}.xml`);
      fs.writeFileSync(local, xml);
      shell(serial, `am force-stop ${PACKAGE}`);
      adb(serial, ['push', local, '/data/local/tmp/rpm-voice.xml']);
      adb(serial, ['shell', 'run-as', PACKAGE, 'mkdir', '-p', 'shared_prefs']);
      adb(serial, ['shell', 'run-as', PACKAGE, 'cp', '/data/local/tmp/rpm-voice.xml', 'shared_prefs/rpm-voice.xml']);
      await putStore();
      if (argv.warm) {
        await openLauncher(serial, 'com.rpm.widget.capture');
        await reads.capturePage('Capture to open before a warm voice-time run');
        await sleep(1500);
        shell(serial, 'input keyevent 3');
        await sleep(1200);
      }
      let backs = 0;
      while (/PlannerActivity/.test(foregroundActivity(serial) ?? '') && backs < 6) { shell(serial, 'input keyevent 4'); backs += 1; await sleep(700); }
      const t0 = Date.now();
      await openLauncher(serial, 'com.rpm.widget.voice');
      await reads.capturePage('Capture to open for voice-time');
      return t0;
    },
    async armAndStart(fixture) {
      const base64 = fs.readFileSync(fixture.wavPath).toString('base64');
      await reads.pageEval(armExpression({id: fixture.id, base64}));
    },
    async playClip(fixture) {
      const base64 = fs.readFileSync(fixture.wavPath).toString('base64');
      const n = await reads.pageEval(`window.__rpmFakeMicPlay?.(${JSON.stringify({id: fixture.id, base64})}) ?? null`);
      if (n == null) throw new UserError('The fake mic is not open, so the second clip cannot play.', 'Use a debug build and start voice-time without --human.');
    },
    async hangUp() {
      for (let tries = 0; tries < 4 && (await reads.pageEval(hasMark('T10'))) !== true; tries++) {
        try { await driveCommands.tap({...argv, name: 'Hang up', role: 'button', _: []}); } catch (e) { if (!(e instanceof UserError)) throw e; }
        await sleep(1200);
      }
    },
    async describeDevice() {
      const state = target(argv, {mutates: true}).state;
      return {buildHash: state?.webSha256 ?? state?.installedSha256 ?? null, device: serial, networkType: null};
    },
  };
}

const PROPS = ['ro.kernel.qemu', 'ro.boot.qemu', 'ro.hardware'];

/** Asks the device itself; a device that cannot answer is treated as a phone. */
export function deviceIsEmulator(serial) {
  if (!serial) return false;
  const props = {};
  for (const name of PROPS) props[name] = adb(serial, ['shell', 'getprop', name], {allowFail: true}).trim();
  return isEmulatorDevice({serial, props});
}

export async function voiceTime(argv) {
  const emulator = deviceIsEmulator(argv.serial ?? readState()?.serial);
  const plan = parseVoiceTimeArgs(argv, {emulator});
  return runVoiceTimes(plan, emulator ? emulatorVoiceTimeIo(argv, loadVoiceFixtures()) : phoneVoiceTimeIo(argv));
}
