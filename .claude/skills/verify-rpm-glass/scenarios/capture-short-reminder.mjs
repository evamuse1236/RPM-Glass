import {sleep} from './lib.mjs';

export const id = 'capture-short-reminder';
export const rule = 'A short reminder such as "set a reminder in 5" is read on the phone without the AI: it saves a reminder five minutes from now, names it "Reminder", offers "Name it" and Undo, and keeps the typed words.';
export const enforces = 'User report 2026-10-19 ("I said set a reminder in 5 and it failed"); feat/capture-smart rounds 1-3 (5b0caa1, 5adba39, e52a0ed).';

const WORDS = 'set a reminder in 5';

export async function run(t) {
  await t.do('display', 'phone');
  await t.do('seed');
  await t.do('open', 'widget-capture');
  await t.do('tap', '--role', 'textbox', '--name', 'Capture a thought');
  await t.do('type', WORDS);
  await t.do('tap', '--role', 'button', '--name', 'Send');
  const sent = Date.now(), timeline = [];
  for (let last = null; Date.now() - sent < 30000; await sleep(500)) {
    const text = (await t.read(() => document.getElementById('content')?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 120);
    if (text !== last) timeline.push({ms: Date.now() - sent, text});
    last = text;
    if (/Name it/.test(text)) break;
  }
  t.facts.timeline = timeline;
  const readMs = timeline.find(s => /Name it/.test(s.text))?.ms;
  t.expect(readMs !== undefined, '"Name it" never appeared within 30 s of Send', timeline);
  await sleep(800);
  await t.shot('saved');
  const screen = await t.read(() => document.getElementById('content')?.innerText ?? '');
  const store = await t.store();
  const reminders = (store.entries ?? []).filter(e => e.raw === WORDS || (e.title === 'Reminder' && e.alertIntent?.type === 'reminder'));
  const minutesAhead = reminders.map(e => Math.round((Date.parse(e.planned) - Date.parse(e.created)) / 60000));
  Object.assign(t.facts, {reminders: reminders.map(e => ({title: e.title, planned: e.planned, created: e.created, alert: e.alertIntent?.type})), minutesAhead});
  t.expect(reminders.length === 1, `Expected one saved reminder; found ${reminders.length}`, t.facts.reminders);
  t.expect(reminders[0]?.alertIntent?.type === 'reminder', 'The saved item should carry a reminder alert', t.facts.reminders);
  t.expect(minutesAhead[0] >= 4 && minutesAhead[0] <= 6, `The reminder should be five minutes ahead; it is ${minutesAhead[0]} minutes ahead`, t.facts);
  const read = Object.values(store.intentV2?.captures ?? {}).filter(c => c.raw === WORDS).map(c => ({local: c.localInterpretation ?? null, modelRuns: c.modelRuns?.length ?? 0}));
  t.facts.read = read;
  t.expect(read.length === 1 && read[0].local === 'short-reminder' && read[0].modelRuns === 0, 'The phone should read the reminder itself, with no AI call', read);
  t.expect(/Undo/.test(screen), 'The receipt should offer Undo', screen.slice(0, 400));
  t.expect(!/overlaps/i.test(screen), 'A reminder is a moment and never clashes', screen.slice(0, 400));
}
