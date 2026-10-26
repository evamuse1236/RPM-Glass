import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { withTimeZone } from './zoned-time.mjs';

// The oracle is the same probe in a fresh process whose actual local zone is TZ.
function probe() {
  const getters = ['getFullYear', 'getYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds', 'getTimezoneOffset'];
  const describe = d => ({
    getters: getters.map(name => d[name]()), iso: Number.isNaN(+d) ? null : d.toISOString(),
    strings: [d.toString(), d.toDateString(), d.toTimeString(), d.toLocaleString(), d.toLocaleDateString(), d.toLocaleTimeString(),
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      d.toLocaleString('en-GB', { timeZone: 'Europe/London' })],
  });
  const setters = [
    ['setFullYear', 2027, 13, 3], ['setYear', 99], ['setMonth', 14, 2], ['setDate', 0],
    ['setHours', 23, 59], ['setHours', 2, 30], ['setHours', 1, 30], ['setMinutes', 90, 3, 12], ['setSeconds', 80, 123], ['setMilliseconds', 1200],
    ['setHours', undefined], ['setFullYear', 2026], ['setYear', 26],
  ];
  const instants = ['2026-10-28T20:00:00Z', '2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z',
    '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-01-01T00:00:00Z', 'invalid'];
  const errorOf = run => { try { return run(); } catch (e) { return e.name; } };
  const inherited = Object.create({ hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return {
    options: [
      new Date(instants[0]).toLocaleTimeString('en-US', inherited),
      new Intl.DateTimeFormat('en-US', inherited).format(new Date(instants[0])),
      ...[null, { timeZone: null }, { timeZone: 'bad/zone' }].flatMap(options => [
        errorOf(() => new Date(instants[0]).toLocaleString('en', options)),
        errorOf(() => new Date(NaN).toLocaleString('en', options)),
        errorOf(() => new Intl.DateTimeFormat('en', options).format(new Date(instants[0]))),
      ]),
    ],
    instants: instants.map(s => describe(new Date(s))),
    constructors: [[2026, 9, 29, 17, 0], [2026, 2, 8, 2, 30], [2026, 10, 1, 1, 30],
      [99, 0], [2026, -1, 32, 25, 61, 70, 1234]].map(args => describe(new Date(...args))),
    mutations: instants.flatMap(s => setters.map(([name, ...args]) => {
      const d = new Date(s); const result = d[name](...args); return { result, date: describe(d) };
    })),
    localStrings: ['2026-10-29T17:00:00', '2026-03-08T02:30:00', '2026-11-01T01:30:00',
      'March 8 2026 02:30:00', '2026', '2026-10', 'Oct 29 2026 17:00 EST'].map(s => describe(new Date(s))),
    dateOnly: describe(new Date('2026-10-29')),
    static: [Date.UTC(2026, 9, 29, 17), Date.parse('2026-10-29T17:00:00+05:30')],
    intl: [Intl.DateTimeFormat().resolvedOptions().timeZone,
      new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long' }).format(new Date(instants[0])),
      Intl.DateTimeFormat.prototype.resolvedOptions.call(new Intl.DateTimeFormat()).timeZone,
      new Intl.DateTimeFormat('en', { timeZone: 'UTC' }).resolvedOptions().timeZone],
  };
}
const json = value => JSON.parse(JSON.stringify(value));
for (const zone of ['Asia/Kolkata', 'America/New_York']) {
  test(`Date and Intl match native TZ=${zone}, including DST gaps and overlaps`, () => {
    const expected = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `console.log(JSON.stringify((${probe})()))`], {
      env: { ...process.env, TZ: zone }, encoding: 'utf8',
    }));
    const previousTZ = process.env.TZ;
    try {
      for (const host of ['UTC', 'America/New_York']) {
        process.env.TZ = host;
        assert.deepEqual(json(withTimeZone(zone, probe)), expected, `host TZ=${host}`);
      }
    } finally {
      if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
    }
  });
}

test('sync, async, nested calls and failures restore globals and preserve Date identity', async () => {
  const OriginalDate = Date, OriginalFormat = Intl.DateTimeFormat, existing = new Date();
  const now = Date.now();
  assert.equal(withTimeZone('Asia/Kolkata', () => {
    assert.ok(existing instanceof Date);
    assert.ok(new Date() instanceof OriginalDate);
    assert.ok(Math.abs(Date.now() - now) < 1000);
    assert.equal(withTimeZone('America/New_York', () => Intl.DateTimeFormat().resolvedOptions().timeZone), 'America/New_York');
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, new OriginalFormat('en', { timeZone: 'Asia/Kolkata' }).resolvedOptions().timeZone);
    return 42;
  }), 42);
  assert.equal(Date, OriginalDate);
  const failure = new Error('callback failed');
  assert.throws(() => withTimeZone('Asia/Kolkata', () => { throw failure; }), e => e === failure);
  assert.equal(Date, OriginalDate);
  assert.equal(await withTimeZone('Asia/Kolkata', async () => {
    await Promise.resolve(); return new Date(2026, 9, 29, 17).toISOString();
  }), '2026-10-29T11:30:00.000Z');
  await assert.rejects(withTimeZone('America/New_York', async () => { await Promise.resolve(); throw failure; }), e => e === failure);
  assert.equal(Date, OriginalDate);
  assert.equal(Intl.DateTimeFormat, OriginalFormat);
  assert.throws(() => withTimeZone('not/a-zone', () => {}), RangeError);
  assert.equal(Date, OriginalDate);
});

test('Capture in UTC with a scoped zone saves the native Kolkata task and receipt', async () => {
  const { runCaptureSpike } = await import('../scripts/web-sync/capture-run.mjs');
  const args = { text: 'call the bank tomorrow at 5pm', timezone: 'Asia/Kolkata', now: '2026-10-28T10:00:00+05:30' };
  const runner = new URL('../scripts/web-sync/capture-run.mjs', import.meta.url).href;
  const expected = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { runCaptureSpike } from ${JSON.stringify(runner)}; console.log(JSON.stringify(await runCaptureSpike(${JSON.stringify(args)})));`], {
    env: { ...process.env, TZ: 'Asia/Kolkata' }, encoding: 'utf8',
  }));
  const previousTZ = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    assert.equal(new Date(args.now).getTimezoneOffset(), 0);
    const actual = await withTimeZone(args.timezone, () => runCaptureSpike(args));
    assert.deepEqual(actual, expected);
    assert.deepEqual(actual.tasks, [{ title: 'Call the bank', planned: '2026-10-29T11:30:00.000Z', plannedDate: null }]);
    assert.deepEqual(actual.receiptText, ['Added · Call the bank · Thu 29 Oct, 5:00\u00a0PM · Inbox']);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
  }
});
