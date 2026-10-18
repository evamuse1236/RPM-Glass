const DEFAULT_URL = 'https://evams.evamuse.chatgpt.site/api/site-data';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';

function calendarDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? value : null;
}

function clock(value) {
  if (typeof value !== 'string') return null;
  const match = /^\s*(0?[1-9]|1[0-2])(?:\s*:\s*([0-5]\d))?\s*(AM|PM)\s*$/i.exec(value);
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2] ?? '00'}`;
}

/** Return normalized deadlines and skipped rows. Invalid envelopes and duplicate IDs throw. */
export function parseEvamsFeed(json) {
  if (!isRecord(json) || !Array.isArray(json.assignments)) {
    throw new TypeError('evams feed must contain an assignments array');
  }
  const items = [];
  const skipped = [];
  const ids = new Set();
  for (const row of json.assignments) {
    if (!isRecord(row)) {
      skipped.push({ id: null, reason: 'assignment must be an object' });
      continue;
    }
    if (typeof row.id !== 'string' || row.id.trim() === '') {
      skipped.push({ id: null, reason: 'assignment must have a nonblank string id' });
      continue;
    }
    if (ids.has(row.id)) throw new TypeError(`Duplicate evams id: ${row.id}`);
    ids.add(row.id);

    const window = isRecord(row.submissionWindow) ? row.submissionWindow : null;
    const windowDate = calendarDate(window?.closesOn);
    const date = windowDate ?? calendarDate(row.dueDate);
    if (date === null) {
      skipped.push({ id: row.id, reason: 'assignment has no usable calendar date' });
      continue;
    }
    const windowTime = window?.time;
    const hasWindowTime = windowTime != null && !(typeof windowTime === 'string' && windowTime.trim() === '');
    const time = clock(windowDate && hasWindowTime ? windowTime : row.time);
    const utc = time === null ? null : new Date(`${date}T${time}:00+05:30`).toISOString();
    items.push({
      sourceId: `evams:${row.id}`,
      title: text(row.title),
      course: text(row.course),
      deadline: { date, time, utc },
      status: text(row.status),
      raw: row,
    });
  }
  return { items, skipped };
}

const comparedFields = [
  ['title', (before, after) => before.title === after.title],
  ['course', (before, after) => before.course === after.course],
  ['deadline', (before, after) => before.deadline.date === after.deadline.date
    && before.deadline.time === after.deadline.time && before.deadline.utc === after.deadline.utc],
  ['status', (before, after) => before.status === after.status],
];

function indexItems(items) {
  const index = new Map();
  for (const item of items) {
    if (index.has(item.sourceId)) throw new TypeError(`Duplicate deadline sourceId: ${item.sourceId}`);
    index.set(item.sourceId, item);
  }
  return index;
}

/** Compare normalized items. Missing items remain evidence, never inferred deletions. */
export function diffDeadlines(previousItems, nextItems) {
  const previous = indexItems(previousItems);
  const next = indexItems(nextItems);
  const added = [];
  const changed = [];
  const unchanged = [];
  const missing = [];
  for (const after of nextItems) {
    if (!previous.has(after.sourceId)) {
      added.push(after);
      continue;
    }
    const before = previous.get(after.sourceId);
    const fields = comparedFields.filter(([, equal]) => !equal(before, after)).map(([name]) => name);
    if (fields.length) changed.push({ before, after, fields });
    else unchanged.push(after);
  }
  for (const before of previousItems) {
    if (!next.has(before.sourceId)) missing.push(before);
  }
  return { added, changed, unchanged, missing };
}

/** Read one public snapshot. Transport, HTTP, JSON, and feed validation failures propagate. */
export async function fetchEvamsFeed(url = DEFAULT_URL, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`evams feed request failed (HTTP ${response.status})`);
  return parseEvamsFeed(await response.json());
}
