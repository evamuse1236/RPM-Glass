/** The demo phone's stand-in for Capture's model: it splits the words into one to three Inbox tasks. */
import {localDay, shiftDay} from '../../../android-companion/planner-state.mjs';
import {absoluteDay} from '../../../android-companion/capture-content.mjs';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_WORDS = /\b(?:on\s+)?(today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

export function splitCapture(text) {
  const parts = text.split(/\s*(?:[,;\n]|\band\b|\bthen\b)\s*/i).map(p => p.trim()).filter(p => p.length > 1);
  return (parts.length ? parts : [text.trim()]).slice(0, 3);
}

export function readDay(part, today) {
  const match = DAY_WORDS.exec(part);
  const title = part.replace(DAY_WORDS, ' ').replace(/\s+/g, ' ').trim() || part;
  if (!match) return {title, day: null};
  const word = match[1].toLowerCase();
  if (word === 'today' || word === 'tonight') return {title, day: today};
  if (word === 'tomorrow') return {title, day: shiftDay(today, 1)};
  const ahead = (WEEKDAYS.indexOf(word) - new Date(today + 'T12:00').getDay() + 7) % 7 || 7;
  return {title, day: shiftDay(today, ahead)};
}

const sentence = text => text[0].toUpperCase() + text.slice(1);

export function mockCapture(snapshot, command, now = new Date()) {
  const next = structuredClone(snapshot);
  const today = localDay(now);
  let id = Math.max(0, ...next.tasks.map(t => t.id));
  const created = splitCapture(command.args.text).map(part => {
    const {title, day} = readDay(part, today);
    const task = {id: ++id, title: sentence(title), raw: part, notes: '', purpose: '', planned: null, plannedDate: day,
      minutes: null, alert: null, blockId: null, must: false, priority: null, done: false, archived: false,
      archiveDisposition: null, recurrence: null, repeatAfterDays: null, completedAt: null, completedOccurrences: []};
    next.tasks.push(task);
    return task;
  });
  next.captures = [...next.captures, {
    id: command.id, text: command.args.text, status: 'done', createdAt: new Date(now).toISOString(),
    receipt: created.map(t => ({text: `Added · ${t.title} · ${t.plannedDate ? absoluteDay(t.plannedDate, today) : 'Inbox'}`})),
  }].slice(-50);
  return {snapshot: next, taskIds: created.map(t => t.id)};
}

export function undoCapture(snapshot, commandId, taskIds) {
  const next = structuredClone(snapshot);
  for (const task of next.tasks) if (taskIds.includes(task.id)) Object.assign(task, {archived: true, archiveDisposition: 'trash'});
  const capture = next.captures.find(c => c.id === commandId);
  if (capture) capture.status = 'undone';
  return next;
}
