import {sleep} from './lib.mjs';

export const id = 'notch-island';
export const rule = 'With the Notch setting and RPM Notch on, the two drops show around the camera over the home screen; a tap on the task half opens its island and a swipe up from inert island space logs notch.gesture up and closes it, with no crash.';
export const enforces = 'Notch redesign (feat/notch-apple, 0f2c254 alert row Done circle); docs/rules/notch.md tap and open rows; user 2026-10-19: "use github actions from now on for emulator tests".';

const PILL = /island drops /;
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

  const width = Number(/(\d+)x\d+/.exec(t.shell('wm size'))?.[1] ?? 1080), x = Math.round(width / 2) - 24;
  const density = Number(/(\d+)\s*$/.exec(t.shell('wm density').trim())?.[1] ?? 450) / 160;
  const open = async () => {
    const from = notchLog(t).length;
    t.shell(`input tap ${x} 69`);
    return waitForLog(t, from, /island (expanded|habit) /, '"island expanded" or "island habit" after a tap on the task half');
  };
  await sleep(3000);
  const expanded = await open();
  const islandBottom = Number(/window \[0,0\]\[\d+,(\d+)\]/.exec(expanded)?.[1]);
  t.expect(islandBottom > 0, 'The expanded island did not log its window', [expanded]);
  const inertX = Math.round(10 * density), inertY = Math.round(islandBottom / 2);
  const beforeClose = notchLog(t).length;
  t.shell(`input swipe ${inertX} ${inertY} ${inertX} ${inertY - Math.round(140 * density)} 150`);
  const gesture = await waitForLog(t, beforeClose, /notch\.gesture up \{"on":"OPEN"/, '"notch.gesture up" on the open island after a swipe from its inert left margin');
  const closed = await waitForLog(t, beforeClose, PILL, 'the pill again after a swipe up');
  const stray = notchLog(t).slice(beforeClose).filter(l => /notch\.gesture (?!up)|notch\.(drink|open_|log_meal|done)/.test(l));
  t.expect(!stray.length, 'The swipe from inert space also fired a tap or a control', stray);
  await sleep(1000);
  await open();
  await sleep(1200);
  await t.shot('open');
  Object.assign(t.facts, {pill, gesture, closed});
  const crashes = t.shell('logcat -d -b crash').split('\n').filter(l => /com\.rpm\.prototype/.test(l));
  t.expect(!crashes.length, 'The app crashed while the notch was shown', crashes.slice(0, 5));
  await t.do('open', 'planner', '--timeout', '90000');
}
