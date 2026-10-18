import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEvamsFeed, diffDeadlines, fetchEvamsFeed } from './evams-deadlines.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/evams-site-data.sample.json', import.meta.url), 'utf8'));
const row = patch => ({ id: 'lms-123', title: 'Assessment', course: 'Course', dueDate: '2026-10-18', time: '11:00 PM', status: 'active', ...patch });
const parseRow = patch => parseEvamsFeed({ assignments: [row(patch)] }).items[0];
const snapshot = rows => parseEvamsFeed({ assignments: rows }).items;
const jsonResponse = value => new Response(JSON.stringify(value), { status: 200 });

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('normalization preserves exact identities, original strings, and raw evidence', () => {
  const original = row({ id: ' legacy-assessment ', lmsContentId: '999', title: ' Title ', course: '课程', status: ' Tentative ' });
  const { items, skipped } = parseEvamsFeed({ assignments: [original] });
  assert.deepEqual(items, [{
    sourceId: 'evams: legacy-assessment ', title: ' Title ', course: '课程',
    deadline: { date: '2026-10-18', time: '23:00', utc: '2026-10-18T17:30:00.000Z' },
    status: ' Tentative ', raw: original,
  }]);
  assert.strictEqual(items[0].raw, original);
  assert.deepEqual(skipped, []);
});

test('optional text becomes empty and nonactive statuses are retained verbatim', () => {
  const statuses = ['active', 'tentative', 'postponed', 'cancelled', 'details-pending', 'NEW STATUS'];
  const items = snapshot(statuses.map((status, index) => row({ id: String(index), status, title: undefined, course: null })));
  assert.deepEqual(items.map(item => item.status), statuses);
  assert.ok(items.every(item => item.title === '' && item.course === ''));
  assert.equal(parseRow({ status: 12 }).status, '');
});

for (const [input, time, utc] of [
  ['12 AM', '00:00', '2026-10-17T18:30:00.000Z'],
  ['12:00 AM', '00:00', '2026-10-17T18:30:00.000Z'],
  ['12 PM', '12:00', '2026-10-18T06:30:00.000Z'],
  ['12:00 PM', '12:00', '2026-10-18T06:30:00.000Z'],
  ['11:00 PM', '23:00', '2026-10-18T17:30:00.000Z'],
  ['  01 : 05 aM  ', '01:05', '2026-10-17T19:35:00.000Z'],
  ['5:29 AM', '05:29', '2026-10-17T23:59:00.000Z'],
  ['5:30AM', '05:30', '2026-10-18T00:00:00.000Z'],
]) {
  test(`IST clock ${JSON.stringify(input)} has an explicit UTC instant`, () => {
    assert.deepEqual(parseRow({ time: input }).deadline, { date: '2026-10-18', time, utc });
  });
}

test('missing and junk clocks stay unknown without guessing or matching partial text', () => {
  for (const time of [undefined, null, '', ' ', 2300, {}, 'Not specified by LMS', 'time to be confirmed',
    '11:30 AM-1:00 PM', '11 PM onwards', 'at 11 PM', '23:00', '0 AM', '00:00 AM', '13 PM',
    '11:60 PM', '11:5 PM', '11: PM', '11.00 PM', '11:00:00 PM', '111 PM', '11:00 A.M.']) {
    assert.deepEqual(parseRow({ time }).deadline, { date: '2026-10-18', time: null, utc: null }, String(time));
  }
});

test('a valid window closing date and its clock take precedence over the due date', () => {
  assert.deepEqual(parseRow({ submissionWindow: { closesOn: '2026-11-12', time: '12 AM' } }).deadline,
    { date: '2026-11-12', time: '00:00', utc: '2026-11-11T18:30:00.000Z' });
  assert.equal(parseRow({ dueDate: 'bad', submissionWindow: { closesOn: '2026-11-12' } }).deadline.date, '2026-11-12');
});

test('only an absent or blank selected window clock falls back to the top-level clock', () => {
  for (const time of [undefined, null, '', ' \t ']) {
    assert.equal(parseRow({ submissionWindow: { closesOn: '2026-11-12', time } }).deadline.time, '23:00');
  }
  for (const time of ['Not specified by LMS', 'junk', '11 AM-1 PM', 11, {}]) {
    assert.deepEqual(parseRow({ submissionWindow: { closesOn: '2026-11-12', time } }).deadline,
      { date: '2026-11-12', time: null, utc: null });
  }
});

test('an unusable window date uses the due date and top-level clock together', () => {
  for (const submissionWindow of [null, [], 'invalid', { closesOn: '2026-02-30', time: '12 AM' }, { time: '12 AM' }]) {
    assert.deepEqual(parseRow({ submissionWindow }).deadline,
      { date: '2026-10-18', time: '23:00', utc: '2026-10-18T17:30:00.000Z' });
  }
});

test('strict calendar dates reject rollovers, malformed dates, and nonleap centuries', () => {
  for (const dueDate of ['2026-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-00-01',
    '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', ' 2026-01-01',
    '2026-01-01 ', '2026-01-01\n', '2026-01-01\r', '2026-01-01T00:00:00Z', '0000-01-01', null, 20260101]) {
    assert.deepEqual(parseEvamsFeed({ assignments: [row({ dueDate })] }).items, [], String(dueDate));
  }
  for (const dueDate of ['2024-02-29', '2000-02-29', '0001-01-01', '0099-12-31', '9999-12-31']) {
    assert.equal(parseRow({ dueDate, time: null }).deadline.date, dueDate);
  }
  assert.equal(parseRow({ dueDate: '2026-01-01', time: '12 AM' }).deadline.utc, '2025-12-31T18:30:00.000Z');
});

test('bad rows are skipped in source order with usable IDs and deterministic reasons', () => {
  const input = { assignments: [null, [], 'bad', row({ id: undefined }), row({ id: '' }), row({ id: ' \t' }), row({ id: 123 }), row({ id: 'undated', dueDate: 'bad' }), row()] };
  const first = parseEvamsFeed(input);
  assert.deepEqual(first.skipped, [
    ...Array.from({ length: 3 }, () => ({ id: null, reason: 'assignment must be an object' })),
    ...Array.from({ length: 4 }, () => ({ id: null, reason: 'assignment must have a nonblank string id' })),
    { id: 'undated', reason: 'assignment has no usable calendar date' },
  ]);
  assert.equal(first.items.length, 1);
  assert.deepEqual(parseEvamsFeed(input), first);
});

test('invalid envelopes throw while an explicit empty assignments array is valid', () => {
  for (const input of [null, undefined, [], 'bad', 5, {}, { assignments: null }, { assignments: {} }]) {
    assert.throws(() => parseEvamsFeed(input), TypeError);
  }
  assert.deepEqual(parseEvamsFeed({ assignments: [] }), { items: [], skipped: [] });
});

test('duplicate feed identities throw even when either occurrence has no usable date', () => {
  for (const dates of [['2026-10-18', '2026-10-18'], ['bad', '2026-10-18'], ['2026-10-18', 'bad'], ['bad', 'bad']]) {
    assert.throws(() => parseEvamsFeed({ assignments: dates.map(dueDate => row({ dueDate })) }), /Duplicate evams id/);
  }
  assert.equal(snapshot([row({ id: 'x' }), row({ id: ' x' })]).length, 2);
});

test('diff buckets preserve next order, previous missing order, and original object references', () => {
  const previous = snapshot(['missing-2', 'changed-1', 'same-1', 'missing-1', 'changed-2', 'same-2'].map(id => row({ id })));
  const next = snapshot(['added-2', 'same-2', 'changed-2', 'added-1', 'changed-1', 'same-1'].map(id => row({ id, title: id.startsWith('changed') ? 'Renamed' : 'Assessment' })));
  const result = diffDeadlines(previous, next);
  assert.deepEqual(result, {
    added: [next[0], next[3]],
    changed: [{ before: previous[4], after: next[2], fields: ['title'] }, { before: previous[1], after: next[4], fields: ['title'] }],
    unchanged: [next[1], next[5]], missing: [previous[0], previous[3]],
  });
  assert.strictEqual(result.added[0], next[0]);
  assert.strictEqual(result.changed[0].before, previous[4]);
  assert.strictEqual(result.changed[0].after, next[2]);
  assert.strictEqual(result.unchanged[0], next[1]);
  assert.strictEqual(result.missing[0], previous[0]);
});

test('diff reports top-level field names in fixed order and excludes raw metadata', () => {
  const before = parseRow();
  const after = parseRow({ title: 'New title', course: 'New course', dueDate: '2026-10-19', status: 'cancelled' });
  assert.deepEqual(diffDeadlines([before], [after]).changed[0].fields, ['title', 'course', 'deadline', 'status']);
  const metadata = parseRow({ lmsDateChange: { previous: '2026-10-17', noticedAt: '2026-10-18T00:00:00Z' }, lastUpdated: 'new' });
  assert.deepEqual(diffDeadlines([before], [metadata]), { added: [], changed: [], unchanged: [metadata], missing: [] });
});

test('each deadline scalar and removed clock time is a deadline change', () => {
  const before = parseRow();
  for (const patch of [{ date: '2026-10-19' }, { time: '22:00' }, { utc: '2026-10-18T16:30:00.000Z' }]) {
    const after = { ...before, deadline: { ...before.deadline, ...patch } };
    assert.deepEqual(diffDeadlines([before], [after]).changed[0].fields, ['deadline']);
  }
  assert.deepEqual(diffDeadlines([before], [parseRow({ time: undefined })]).changed[0].fields, ['deadline']);
});

test('empty diff inputs distinguish additions from missing items without deletions', () => {
  const items = [parseRow()];
  assert.deepEqual(diffDeadlines([], []), { added: [], changed: [], unchanged: [], missing: [] });
  assert.deepEqual(diffDeadlines([], items), { added: items, changed: [], unchanged: [], missing: [] });
  assert.deepEqual(diffDeadlines(items, []), { added: [], changed: [], unchanged: [], missing: items });
});

test('duplicate source IDs are rejected on either diff side', () => {
  const item = parseRow();
  assert.throws(() => diffDeadlines([item, item], []), /Duplicate deadline sourceId/);
  assert.throws(() => diffDeadlines([], [item, { ...item, title: 'Different' }]), /Duplicate deadline sourceId/);
});

test('parse and diff do not mutate frozen caller inputs', () => {
  const input = freeze(structuredClone(fixture));
  const original = structuredClone(input);
  const previous = freeze(parseEvamsFeed(input).items);
  const next = freeze(snapshot(input.assignments.map(assignment => ({ ...assignment, title: `${assignment.title}!` }))));
  const previousCopy = structuredClone(previous);
  const nextCopy = structuredClone(next);
  diffDeadlines(previous, next);
  assert.deepEqual(input, original);
  assert.deepEqual(previous, previousCopy);
  assert.deepEqual(next, nextCopy);
});

test('the captured fixture has at most eight sanitized assessment rows and allowed fields', () => {
  assert.deepEqual(Object.keys(fixture), ['assignments']);
  assert.ok(fixture.assignments.length > 0 && fixture.assignments.length <= 8);
  const fields = new Set(['id', 'lmsContentId', 'title', 'course', 'dueDate', 'time', 'submissionWindow', 'status', 'lmsDateChange']);
  for (const assignment of fixture.assignments) {
    assert.ok(Object.keys(assignment).every(key => fields.has(key)));
    if (assignment.submissionWindow) assert.ok(Object.keys(assignment.submissionWindow).every(key => ['closesOn', 'time'].includes(key)));
    if (assignment.lmsDateChange) assert.ok(Object.keys(assignment.lmsDateChange).every(key => ['previous', 'noticedAt'].includes(key)));
  }
  assert.doesNotMatch(JSON.stringify(fixture), /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|roll[ -]?(?:no|number)|student[ -]?(?:name|id)/i);
});

test('the captured fixture parses its observed deadlines and nonactive assessment', () => {
  const { items, skipped } = parseEvamsFeed(fixture);
  assert.equal(items.length, 8);
  assert.deepEqual(skipped, []);
  assert.equal(items[0].sourceId, 'evams:pmdl-pre-work-2026-09-20');
  assert.deepEqual(items[4].deadline, { date: '2026-09-21', time: '23:00', utc: '2026-09-21T17:30:00.000Z' });
  assert.deepEqual(items[1].deadline, { date: '2026-09-14', time: null, utc: null });
  assert.equal(items[6].status, 'details-pending');
  assert.match(items[0].title, /\u2014/);
});

test('fetch uses the default public URL once and composes the fixture parser', async () => {
  const calls = [];
  const actual = await fetchEvamsFeed(undefined, async (...args) => { calls.push(args); return jsonResponse(fixture); });
  assert.deepEqual(calls, [['https://evams.evamuse.chatgpt.site/api/site-data']]);
  assert.deepEqual(actual, parseEvamsFeed(fixture));
});

test('fetch preserves a custom URL and parser skipped rows', async () => {
  const input = { assignments: [row(), row({ id: 'undated', dueDate: null })] };
  const actual = await fetchEvamsFeed('https://example.test/feed?revision=2', async url => {
    assert.equal(url, 'https://example.test/feed?revision=2');
    return jsonResponse(input);
  });
  assert.deepEqual(actual, parseEvamsFeed(input));
});

test('fetch HTTP failures reject without decoding or retrying', async () => {
  let calls = 0;
  await assert.rejects(fetchEvamsFeed(undefined, async () => {
    calls++;
    return { ok: false, status: 503, json() { assert.fail('HTTP error body must not be decoded'); } };
  }), /HTTP 503/);
  assert.equal(calls, 1);
});

test('fetch propagates transport, JSON, envelope, and duplicate identity errors', async () => {
  const failure = new Error('transport failed');
  await assert.rejects(fetchEvamsFeed(undefined, async () => { throw failure; }), error => error === failure);
  await assert.rejects(fetchEvamsFeed(undefined, async () => new Response('{broken')), SyntaxError);
  await assert.rejects(fetchEvamsFeed(undefined, async () => jsonResponse({})), TypeError);
  await assert.rejects(fetchEvamsFeed(undefined, async () => jsonResponse({ assignments: [row(), row()] })), /Duplicate evams id/);
  assert.deepEqual(await fetchEvamsFeed(undefined, async () => jsonResponse({ assignments: [] })), { items: [], skipped: [] });
});
