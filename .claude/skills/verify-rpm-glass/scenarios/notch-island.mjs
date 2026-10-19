import {sleep} from './lib.mjs';

export const id = 'notch-island';
export const rule = 'With the Notch setting and RPM Notch on, the pill shows beside the camera over the home screen; a tap opens the island and a swipe up closes it, with no crash.';
export const enforces = 'Notch redesign (feat/notch-apple, 0f2c254 alert row Done circle); docs/rules/notch.md tap and open rows; user 2026-10-19: "use github actions from now on for emulator tests".';

const PILL = /island [A-Z_]+ /;
const SERVICE = 'com.rpm.prototype/com.rpm.prototype.NotchAccessibilityService';

async function waitForLog(t, from, pattern, label) {
  for (let i = 0; i < 30; i++) {
    const hit = notchLog(t).slice(from).find(l => pattern.test(l));
    if (hit) return hit;
    await sleep(500);
  }
  t.expect(false, `The notch never logged ${label}`, notchLog(t).slice(from).slice(-12));
}

const notchLog = t => t.shell('logcat -d -s RpmNotch:I').split('\n').filter(l => l.includes('RpmNotch'));

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  t.shell('cmd overlay enable com.android.internal.display.cutout.emulation.emu01');
  t.shell(`settings put secure enabled_accessibility_services ${SERVICE}`);
  t.shell('settings put secure accessibility_enabled 1');
  await t.do('open', 'planner');
  const start = notchLog(t).length;
  await t.do('tap', '--name', 'More options');
  await t.do('tap', '--name', 'Settings');
  await t.do('tap', '--role', 'switch', '--name', 'Notch');
  t.shell('am force-stop com.android.settings');
  await t.do('key', 'home');
  await waitForLog(t, start, /notch\.setting.*on/, '"notch.setting on"');
  const pill = await waitForLog(t, start, PILL, 'a pill');
  await sleep(1500);
  await t.shot('pill');

  const width = Number(/(\d+)x\d+/.exec(t.shell('wm size'))?.[1] ?? 1080), x = Math.round(width / 2);
  const open = async () => {
    const from = notchLog(t).length;
    t.shell(`input tap ${x} 69`);
    await waitForLog(t, from, /island expanded/, '"island expanded" after a tap on the pill');
  };
  await sleep(3000);
  await open();
  const beforeClose = notchLog(t).length;
  t.shell(`input swipe ${x} 700 ${x} 300 150`);
  const closed = await waitForLog(t, beforeClose, PILL, 'the pill again after a swipe up');
  await sleep(1000);
  await open();
  await sleep(1200);
  await t.shot('open');
  Object.assign(t.facts, {pill, closed});
  const crashes = t.shell('logcat -d -b crash').split('\n').filter(l => /com\.rpm\.prototype/.test(l));
  t.expect(!crashes.length, 'The app crashed while the notch was shown', crashes.slice(0, 5));
  await t.do('open', 'planner', '--timeout', '90000');
}
