import {sleep} from './lib.mjs';

export const id = 'capture-chips-edit';
export const rule = 'A Capture receipt shows the created task as chips; tapping Time opens a tray in place, a pick saves at once with its own Undo ("Time set to 7 PM"), and that Undo restores only the time while the words and the reminder stay.';
export const enforces = 'User report 2026-10-21 ("show me the various chips which can be edited by touching on them"); docs/design/capture-chips.md.';

const WORDS = 'remind me at 6 pm to call mom';
const screenText = t => t.read(() => (document.getElementById('content')?.innerText ?? '').replace(/\s+/g, ' '));
const savedTask = async t => {
  const store = await t.store();
  const rows = (store.entries ?? []).filter(e => e.raw === WORDS);
  return {count: rows.length, title: rows[0]?.title, planned: rows[0]?.planned, alert: rows[0]?.alertIntent?.type};
};
const localHour = iso => iso ? new Date(iso).getHours() + new Date(iso).getMinutes() / 60 : null;
const localDayOf = iso => iso ? new Date(iso).toDateString() : null;

async function waitFor(t, test, ms = 15000) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(300)) if (test(await screenText(t))) return true;
  return false;
}

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await t.do('open', 'widget-capture');
  await t.do('tap', '--role', 'textbox', '--name', 'Capture a thought');
  await t.do('type', WORDS);
  await t.do('tap', '--role', 'button', '--name', 'Send');
  const chips = async () => t.read(() => [...document.querySelectorAll('.edit-chip')].map(c => ({chip: c.dataset.chip, label: c.innerText.replace(/\s+/g, ' ').trim(), cls: c.className})));
  let shown = [];
  for (const until = Date.now() + 30000; Date.now() < until; await sleep(500)) {
    shown = await chips();
    if (shown.some(c => c.chip === 'time')) break;
  }
  t.facts.chips = shown;
  t.expect(shown.some(c => c.chip === 'time' && /6\s*PM/.test(c.label)), 'The receipt should show a filled Time chip reading 6 PM', shown);
  t.expect(shown.some(c => c.chip === 'alert' && /\blit\b/.test(c.cls)), 'The reminder should show as a lit Alert chip', shown);
  await t.shot('chips');
  const before = await savedTask(t);
  t.facts.before = before;
  t.expect(before.count === 1 && localHour(before.planned) === 18, 'One task saved at 6 PM before the edit', before);

  await t.do('tap', '--css', '.edit-chip[data-chip=time]');
  await sleep(400);
  const picks = await t.read(() => [...document.querySelectorAll('.chip-tray.open .tray-pick')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  t.facts.picks = picks;
  const seven = picks.findIndex(p => /^7 PM$/.test(p));
  t.expect(seven >= 0, 'The open Time tray should offer 7 PM', picks);
  await t.shot('time-tray');
  await t.do('tap', '--css', '.chip-tray.open .tray-pick', '--nth', String(seven));
  const changed = await waitFor(t, s => /Time set to 7 PM/.test(s));
  t.expect(changed, 'The change row should say "Time set to 7 PM"', await screenText(t));
  await sleep(600);
  await t.shot('edited');
  const after = await savedTask(t);
  t.facts.after = after;
  t.expect(after.count === 1, 'The edit changes the same task, never a second one', after);
  t.expect(localHour(after.planned) === 19 && localDayOf(after.planned) === localDayOf(before.planned), 'The task is saved at 7 PM on the same day', after);
  t.expect(after.alert === 'reminder' && after.title === before.title, 'The edit keeps the reminder and the title', after);

  await t.do('tap', '--css', '.change-row button');
  await waitFor(t, s => !/Time set to 7 PM/.test(s), 8000);
  await sleep(600);
  await t.shot('edit-undone');
  const undone = await savedTask(t);
  t.facts.undone = undone;
  t.expect(undone.count === 1 && localHour(undone.planned) === 18, 'The change-row Undo puts the time back to 6 PM and keeps the task', undone);
  t.expect(undone.alert === 'reminder', 'The change-row Undo leaves the reminder alone', undone);
}
