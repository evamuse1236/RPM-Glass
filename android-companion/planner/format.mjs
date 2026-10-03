import {localDay, shiftDay} from '../planner-state.mjs';

export const plural = (count, one, many = one + 's') => `${count} ${count === 1 ? one : many}`;

export function clock(value) {
  return new Date(value).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

/** "30 min", "1 h", "1 h 50 min". */
export function duration(minutes) {
  if (minutes == null) return 'No estimate';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

export function dateText(value) {
  return new Date(value).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'});
}

export function longDate(day) {
  return new Date(day + 'T12:00').toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long'});
}

/** Today / Tomorrow / Yesterday, otherwise a short date. */
export function relativeDay(day) {
  const today = localDay();
  if (day === today) return 'Today';
  if (day === shiftDay(today, 1)) return 'Tomorrow';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return dateText(day + 'T12:00');
}

/** Local value for an <input type=time>. */
export function timeValue(value) {
  const date = new Date(value);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

export function doneStats(rows) {
  const done = rows.filter(task => task.done).length;
  return {done, total: rows.length, percent: rows.length ? Math.round(done / rows.length * 100) : 0};
}

/** FNV-1a: stable keys for captured drafts. */
export function stableKey(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** When a Result's derived deadline (`blockDue(data, id).value`) falls: {at, label, soon, overdue}, or null without one. */
export function dueInfo(value, now = new Date()) {
  if (!value) return null;
  const timed = value.length > 10, at = new Date(timed ? value : value + 'T23:59');
  const day = value.slice(0, 10), today = localDay(now);
  const when = day === today ? 'today' : day === shiftDay(today, 1) ? 'tomorrow'
    : at - now < 6 * 864e5 && at > now ? at.toLocaleDateString([], {weekday: 'short'}) : dateText(day + 'T12:00');
  const overdue = at < now;
  return {at, overdue, soon: !overdue && at - now < 3 * 864e5,
    label: overdue ? 'Overdue since ' + (day === today ? clock(at) : dateText(day + 'T12:00')) : `Due ${when}${timed ? ' ' + clock(at) : ''}`};
}

/** Time left until `at`, coarse enough to read at a glance: "40 min", "37 h", "3 days"; null once it has passed. */
export function timeLeft(at, now = new Date()) {
  const minutes = Math.round((at - now) / 60000);
  if (minutes < 0) return null;
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}
