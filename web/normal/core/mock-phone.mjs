/**
 * A pretend phone for demos and tests. It holds the authoritative snapshot, picks commands up after 1-3 s, applies
 * them with the same rules the overlay uses, and publishes a new revision. Captures become 1-3 Inbox tasks: a demo,
 * not the phone's model.
 */
import {applyCommand, beforeOf, conflictBetween, undoApplied} from './apply.mjs';

const DAY = 864e5;
const FIXTURE_DAY = '2026-10-19';
const localDay = ms => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / DAY);
const shiftInstant = (value, days) => (value ? new Date(Date.parse(value) + days * DAY).toISOString() : value);
const shiftDay = (value, days) => (value ? localDay(Date.parse(value + 'T12:00') + days * DAY) : value);

/** The fixture moved so its day is today: demo data always shows a live day. */
export function rebase(fixture, now = Date.now()) {
  const days = dayDiff(FIXTURE_DAY, localDay(now));
  const s = structuredClone(fixture);
  s.savedAt = new Date(now - 3 * 60000).toISOString();
  for (const t of s.tasks) {
    t.planned = shiftInstant(t.planned, days);
    t.plannedDate = shiftDay(t.plannedDate, days);
    t.completedAt = shiftInstant(t.completedAt, days);
  }
  s.body.water.glasses = s.body.water.glasses.map(g => shiftInstant(g, days));
  s.body.meals = s.body.meals.map(m => ({...m, at: shiftInstant(m.at, days)}));
  s.body.runs = s.body.runs.map(r => ({...r, day: shiftDay(r.day, days), marks: r.marks.map(m => ({...m, at: shiftInstant(m.at, days)}))}));
  s.captures = s.captures.map(c => ({...c, createdAt: shiftInstant(c.createdAt, days)}));
  return s;
}

/** "Call the bank and buy stamps, email Rao" → ["Call the bank", "Buy stamps", "Email Rao"], at most three. */
export function splitCapture(text) {
  const parts = text.split(/\n|[,;]|\band\b|\balso\b/i).map(p => p.trim().replace(/[.?!]+$/, '')).filter(p => p.length > 2);
  const titles = (parts.length ? parts : [text.trim()]).slice(0, 3);
  return titles.map(t => t[0].toUpperCase() + t.slice(1));
}

export function createMockPhone(snapshot, {now = () => Date.now(), random = Math.random, timers = globalThis,
  mode = 'open', rejectWith = null} = {}) {
  const phone = {snapshot, history: new Map([[snapshot.revision, snapshot]]), journal: new Map(), mode};
  const taken = new Set(), cancelled = new Set();
  let listener = () => {};

  const publish = next => {
    next = {...next, revision: phone.snapshot.revision + 1, savedAt: new Date(now()).toISOString()};
    phone.snapshot = next;
    phone.history.set(next.revision, next);
    listener({type: 'loaded', snapshot: next, at: now()});
    return next.revision;
  };
  const answer = (command, status, message, newRevision = null) => listener({type: 'status', id: command.id, status, message, newRevision});

  function capture(command) {
    const s = phone.snapshot, titles = splitCapture(command.args.text);
    let id = Math.max(0, ...s.tasks.map(t => t.id));
    const tasks = titles.map(title => ({id: ++id, title, raw: command.args.text, notes: '', purpose: '', planned: null, plannedDate: null,
      minutes: null, alert: null, blockId: null, must: false, priority: null, done: false, archived: false, archiveDisposition: null,
      recurrence: null, repeatAfterDays: null, completedAt: null, completedOccurrences: []}));
    const entry = {id: command.id, text: command.args.text, status: 'committed', createdAt: command.createdAt,
      receipt: tasks.map(t => ({text: `Added · ${t.title} · Inbox`}))};
    phone.journal.set(command.id, {command, created: tasks.map(t => t.id)});
    return {...s, tasks: [...s.tasks, ...tasks], captures: [...s.captures, entry].slice(-50)};
  }

  function undo(command) {
    const done = phone.journal.get(command.args.commandId);
    if (!done) throw new Error('Your phone has nothing to undo for that.');
    const s = phone.snapshot;
    if (done.command.type === 'capture') {
      const ids = new Set(done.created);
      return {...s, tasks: s.tasks.map(t => (ids.has(t.id) ? {...t, archived: true, archiveDisposition: 'trash'} : t)),
        captures: s.captures.map(c => (c.id === done.command.id ? {...c, status: 'undone'} : c))};
    }
    return undoApplied(s, done.command, done.before, {now: now()});
  }

  function handle(command) {
    taken.add(command.id);
    if (cancelled.has(command.id)) return;
    if (rejectWith) return answer(command, 'rejected', rejectWith);
    try {
      const base = phone.history.get(command.baseRevision);
      const clash = conflictBetween(base, phone.snapshot, command, now());
      if (clash) return answer(command, 'conflict', 'Your phone changed this first.', phone.snapshot.revision);
      let next;
      if (command.type === 'capture') next = capture(command);
      else if (command.type === 'undo') next = undo(command);
      else {
        phone.journal.set(command.id, {command, before: beforeOf(phone.snapshot, command, now())});
        next = applyCommand(phone.snapshot, command, {now: now()});
      }
      answer(command, 'applied', 'Applied on your phone', publish(next));
    } catch (error) {
      answer(command, 'rejected', error instanceof Error ? error : String(error));
    }
  }

  return {
    get snapshot() { return phone.snapshot; },
    get mode() { return phone.mode; },
    listen(fn) { listener = fn; },
    /** Takes a command off the queue after 1-3 s while the phone is open; a closed phone leaves it waiting. */
    receive(command) {
      if (phone.mode !== 'open') return;
      timers.setTimeout(() => handle(command), 1000 + Math.floor(random() * 2000));
    },
    cancel(id) {
      if (taken.has(id)) return false;
      cancelled.add(id);
      return true;
    },
    /** The phone changes a task on its own, as if the person edited it there. */
    editOnPhone(taskId, fields) {
      return publish({...phone.snapshot, tasks: phone.snapshot.tasks.map(t => (t.id === taskId ? {...t, ...fields} : t))});
    },
    handle,
  };
}
