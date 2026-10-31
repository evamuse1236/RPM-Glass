import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PACKAGE, UserError, adb, shell, sleep, waitFor, foregroundActivity, dismissAnr} from './device.mjs';
import {inPage} from './page.mjs';
import {driveCommands} from './drive.mjs';
import {target, openLauncher, errorLines} from './runtime.mjs';
import {RUN_DIR, armExpression, loadVoiceFixtures, parseVoiceTimeArgs, runVoiceTimes} from './voice-time.mjs';

function prefsXml({fixture, delay}) {
  const rows = ['<boolean name="RPM_VOICE_TIMING" value="true" />'];
  if (fixture) rows.push(`<string name="RPM_FAKE_MIC">${fixture}</string>`);
  if (delay) rows.push(`<string name="RPM_VOICE_DELAY">${delay.replace(/[<>&]/g, '')}</string>`);
  return `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n${rows.join('\n')}\n</map>\n`;
}

function defaultVoiceTimeIo(argv, fixtures) {
  const {serial, cdpPort} = target(argv, {mutates: true});
  const pageEval = async expression => {
    const page = await inPage(serial, cdpPort);
    try { return await page.evaluate(expression); }
    finally { page.close(); }
  };
  let minted = false;
  let since = null;
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
  const capturePage = what => waitFor(async () => {
    try { return await pageEval(`document.readyState==='complete'&&!!document.querySelector('#message')`); }
    catch (e) { if (e instanceof UserError) return false; throw e; }
  }, {timeout: 45000, every: 400, what});
  return {
    fixtures,
    now: () => Date.now(),
    sleep,
    async openVoice({fixture, human}) {
      if (minted) await sleep(3500);
      minted = true;
      since = shell(serial, "date '+%m-%d %H:%M:%S.000'").trim();
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
        await capturePage('Capture to open before a warm voice-time run');
        await sleep(1500);
        shell(serial, 'input keyevent 3');
        await sleep(1200);
      }
      let backs = 0;
      while (/PlannerActivity/.test(foregroundActivity(serial) ?? '') && backs < 6) { shell(serial, 'input keyevent 4'); backs += 1; await sleep(700); }
      const t0 = Date.now();
      await openLauncher(serial, 'com.rpm.widget.voice');
      await capturePage('Capture to open for voice-time');
      return t0;
    },
    async armAndStart(fixture) {
      const base64 = fs.readFileSync(fixture.wavPath).toString('base64');
      await pageEval(armExpression({id: fixture.id, base64}));
    },
    async playClip(fixture) {
      const base64 = fs.readFileSync(fixture.wavPath).toString('base64');
      const n = await pageEval(`window.__rpmFakeMicPlay?.(${JSON.stringify({id: fixture.id, base64})}) ?? null`);
      if (n == null) throw new UserError('The fake mic is not open, so the second clip cannot play.', 'Use a debug build and start voice-time without --human.');
    },
    async hangUp() {
      const ended = async () => (await pageEval(`performance.getEntriesByType('mark').some(entry => entry.name==='voice:T10')`)) === true;
      for (let tries = 0; tries < 4 && !(await ended()); tries++) {
        try { await driveCommands.tap({...argv, name: 'Hang up', role: 'button', _: []}); } catch (e) { if (!(e instanceof UserError)) throw e; }
        await sleep(1200);
      }
    },
    async readReceipts() {
      try { return await pageEval(`[...document.querySelectorAll('.voice-card.receipt')].map(node => node.innerText)`); } catch { return []; }
    },
    async waitForStage(name) {
      await waitFor(async () => {
        try { return (await pageEval(`performance.getEntriesByType('mark').some(entry => entry.name==='voice:${name}')`)) === true; }
        catch (e) { if (e instanceof UserError) return false; throw e; }
      }, {timeout: 120000, every: 200, what: `voice stage ${name}`});
    },
    async readMarks() {
      return pageEval(`performance.getEntriesByType('mark').filter(entry => entry.name.startsWith('voice:')).map(entry => ({name: entry.name, startTime: entry.startTime}))`);
    },
    async readClock() {
      return pageEval(`({timeOrigin: performance.timeOrigin, pageNow: Date.now()})`);
    },
    async readLog() {
      return adb(serial, ['logcat', '-d', '-t', '400'], {allowFail: true});
    },
    async describeDevice() {
      const state = target(argv, {mutates: true}).state;
      return {buildHash: state?.webSha256 ?? state?.installedSha256 ?? null, device: serial, networkType: null};
    },
    async readReceipt() {
      try {
        await waitFor(async () => (await pageEval(`!!document.querySelector('.voice-card.receipt')`)) === true, {timeout: 4000, every: 200, what: 'the voice receipt'});
        return await pageEval(`document.querySelector('.voice-card.receipt')?.innerText ?? null`);
      } catch { return null; }
    },
    async countLogErrors() {
      try { return errorLines(serial, since).length; } catch { return 0; }
    },
    async writeRun(run) {
      fs.mkdirSync(RUN_DIR, {recursive: true});
      const file = path.join(RUN_DIR, `${run.runId}.json`);
      fs.writeFileSync(file, JSON.stringify(run, null, 2));
      run.file = file;
    },
  };
}

export async function voiceTime(argv) {
  const plan = parseVoiceTimeArgs(argv);
  const fixtures = loadVoiceFixtures();
  return runVoiceTimes(plan, defaultVoiceTimeIo(argv, fixtures));
}
