/**
 * The mock transport: the browser half of the sync API, talking to the pretend phone in mock-phone.mjs.
 * `scenario` (from ?state=) picks a state to show: stale, offline, reject, conflict, unlinked, empty, loading,
 * needs-answer, pending.
 */
import {createMockPhone, rebase} from './mock-phone.mjs';
import {makeCommand} from './ids.mjs';
import {beforeOf} from './apply.mjs';

export const SCENARIOS = ['stale', 'offline', 'reject', 'conflict', 'unlinked', 'empty', 'loading', 'needs-answer', 'pending'];
const POLL_MS = 20000;
const H = 3600000;

function scenarioSnapshot(fixture, scenario, now) {
  const s = rebase(fixture, now);
  if (scenario === 'stale') s.savedAt = new Date(now - 2 * H).toISOString();
  if (scenario === 'empty') Object.assign(s, {tasks: [], captures: [], drafts: []});
  if (scenario === 'needs-answer') {
    s.captures = [{id: 'c0ffee00-0000-4000-8000-000000000001', text: 'Dentist sometime next week, and book the train to Pune',
      status: 'needs-answer', createdAt: new Date(now - 6 * 60000).toISOString(), receipt: []}];
  }
  return s;
}

const at = (snapshot, id) => snapshot.tasks.find(t => t.id === id);
const todayAt = (now, hour, minute = 0) => {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const tomorrow = now => {
  const d = new Date(now + 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Commands already on screen when a scenario opens, so each state can be seen without clicking. */
function seed(scenario, phone, now) {
  const s = phone.snapshot, rev = s.revision, events = [];
  const queue = (type, args, status, message = null, newRevision = null, minutesAgo = 1) => {
    const command = makeCommand(type, args, {baseRevision: rev, now: now - minutesAgo * 60000});
    events.push({type: 'queued', command, before: beforeOf(s, command, now)});
    if (status !== 'outbox') events.push({type: 'sent', id: command.id, message: 'Waiting for phone'});
    if (status !== 'outbox' && status !== 'pending') events.push({type: 'status', id: command.id, status, message, newRevision});
  };
  if (scenario === 'pending') {
    queue('complete', {taskId: 33}, 'pending');
    queue('reschedule', {taskId: 34, time: null, day: tomorrow(now)}, 'pending');
    queue('move-to-block', {taskId: 24, blockId: 'block-7'}, 'pending');
    queue('log-water', {at: new Date(now - 60000).toISOString()}, 'pending');
    queue('capture', {text: 'Pick up the printouts and email Prof. Rao about the citation format'}, 'pending');
  }
  if (scenario === 'offline') {
    queue('complete', {taskId: 33}, 'outbox');
    queue('capture', {text: 'Ask Mariyam for the budget template'}, 'outbox');
  }
  if (scenario === 'reject') queue('reschedule', {taskId: 31, time: todayAt(now, 21), day: null}, 'rejected', 'That time is past the end of your day on the phone.');
  if (scenario === 'conflict' && at(s, 33)) {
    const phoneRev = phone.editOnPhone(33, {planned: todayAt(now, 11, 30)});
    queue('reschedule', {taskId: 33, time: todayAt(now, 15), day: null}, 'conflict', 'Your phone changed this first.', phoneRev, 2);
  }
  return events;
}

export function mockTransport(fixture, {scenario = null, now = () => Date.now(), timers = globalThis, random = Math.random} = {}) {
  const phone = createMockPhone(scenarioSnapshot(fixture, scenario, now()), {now, timers, random,
    mode: ['stale', 'pending', 'offline'].includes(scenario) ? 'closed' : 'open',
    rejectWith: scenario === 'reject' ? 'Your phone could not apply this change. Open RPM on your phone and try there.' : null});
  let dispatch = () => {}, linked = scenario !== 'unlinked', timer = null;

  const deliver = () => {
    dispatch({type: 'syncing', syncing: true});
    timers.setTimeout(() => {
      dispatch({type: 'loaded', snapshot: phone.snapshot, at: now()});
      dispatch({type: 'syncing', syncing: false});
    }, 500);
  };

  return {
    kind: 'mock',
    scenario,
    start(fn) {
      dispatch = fn;
      phone.listen(event => dispatch(event));
      if (scenario === 'loading') return;
      if (scenario === 'offline') dispatch({type: 'online', online: false});
      if (!linked) return dispatch({type: 'unlinked'});
      const events = seed(scenario, phone, now());
      timers.setTimeout(() => {
        dispatch({type: 'loaded', snapshot: phone.snapshot, at: now()});
        for (const event of events) dispatch(event);
      }, 350);
      timer = timers.setInterval?.(deliver, POLL_MS);
    },
    stop() { timers.clearInterval?.(timer); },
    async send(command) {
      if (scenario === 'offline') throw new Error("You're offline.");
      phone.receive(command);
      return {id: command.id, status: 'pending', message: 'Waiting for phone', newRevision: null};
    },
    cancel: id => phone.cancel(id),
    async link(code) {
      await new Promise(resolve => timers.setTimeout(resolve, 900));
      if (/^X/i.test(code)) throw new Error("That code didn't match. Codes last 10 minutes; ask the phone for a new one.");
      linked = true;
      dispatch({type: 'loaded', snapshot: phone.snapshot, at: now()});
      return {sessionId: 'demo'};
    },
    async unlink() {
      linked = false;
      dispatch({type: 'unlinked'});
    },
    phone,
  };
}
