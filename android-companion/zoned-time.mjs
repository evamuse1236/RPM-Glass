// This is a process-global scope: callers must serialize independent runs.
// Keep the real intrinsics so nested scopes do not compound their offsets.
const NativeDate = globalThis.Date;
const NativeFormat = Intl.DateTimeFormat;
const day = 86_400_000;

export function withTimeZone(timeZone, run) {
  const partsFormat = new NativeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone, era: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  });
  const nameFormat = new NativeFormat('en-US', { timeZone, timeZoneName: 'long' });
  function offset(t) {
    if (!Number.isFinite(t)) return NaN;
    const p = Object.fromEntries(partsFormat.formatToParts(t).map(p => [p.type, p.value]));
    const wall = new NativeDate(0);
    wall.setUTCFullYear(p.era === 'BC' ? 1 - Number(p.year) : Number(p.year), Number(p.month) - 1, Number(p.day));
    wall.setUTCHours(Number(p.hour), Number(p.minute), Number(p.second), 0);
    return +wall - Math.floor(t / 1000) * 1000;
  }
  function local(t) { return new NativeDate(t + offset(t)); }
  function instant(wall) {
    if (!Number.isFinite(wall)) return NaN;
    // Adjacent days supply both offsets at a transition, including skipped days.
    const offsets = [...new Set([-2, -1, 0, 1, 2].map(n => offset(wall + n * day)))];
    const candidates = offsets.map(o => wall - o);
    const valid = candidates.filter(t => t + offset(t) === wall);
    // Native Date chooses the first occurrence; in a gap it uses the old offset.
    return valid.length ? Math.min(...valid) : Math.max(...candidates);
  }
  function parse(value) {
    // ISO date-only is UTC. Offset-bearing strings keep their absolute instant.
    if (/^(?:\d{4}|[+-]\d{6})(?:-\d\d(?:-\d\d)?)?$/.test(value) ||
        /(?:z|[+-]\d\d:?\d\d|\b(?:GMT|UTC|UT|[ECMP][SD]T)\b.*)$/i.test(value)) return NativeDate.parse(value);
    // Parse wall fields as UTC first, so the host's own DST gap cannot erase
    // an hour before we resolve it in the requested zone.
    const wall = /^(?:\d{4}|[+-]\d{6})-\d\d-\d\dT/.test(value)
      ? NativeDate.parse(value + 'Z') : NativeDate.parse(value + ' UTC');
    return instant(wall);
  }
  class ZonedDate extends NativeDate {
    constructor(...args) {
      if (args.length > 1) super(instant(NativeDate.UTC(...args)));
      else if (args.length === 1 && typeof args[0] === 'string') super(parse(args[0]));
      else super(...args);
    }
    static [Symbol.hasInstance](value) { return value instanceof NativeDate; }
    static parse(value) { return parse(String(value)); }
    getTimezoneOffset() { const minutes = Math.trunc(-offset(+this) / 60_000); return minutes === 0 ? 0 : minutes; }
    getYear() { return this.getFullYear() - 1900; }
    setYear(year) {
      year = Number(year);
      if (Number.isNaN(year)) return this.setTime(NaN);
      year = Math.trunc(year);
      return this.setFullYear(year >= 0 && year <= 99 ? year + 1900 : year);
    }
    toDateString() {
      if (Number.isNaN(+this)) return 'Invalid Date';
      const d = local(+this), year = d.getUTCFullYear();
      return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${pad(d.getUTCDate())} ${year < 0 ? '-' : ''}${pad(Math.abs(year), 4)}`;
    }
    toTimeString() {
      if (Number.isNaN(+this)) return 'Invalid Date';
      const d = local(+this), minutes = -this.getTimezoneOffset();
      // V8 uses an equivalent modern year for the display name outside the
      // positive signed-32-bit seconds range (the offset itself stays historical).
      const named = new NativeDate(+this);
      if (+this < 0 || +this > 2_147_483_647_000) {
        const year = named.getUTCFullYear(), jan = new NativeDate(0);
        jan.setUTCFullYear(year, 0, 1);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const recent = (leap ? 1956 : 1967) + (jan.getUTCDay() * 12) % 28;
        named.setUTCFullYear(2008 + (recent + 84 - 2008) % 28);
      }
      const name = nameFormat.formatToParts(+named).find(p => p.type === 'timeZoneName').value;
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)} (${name})`;
    }
    toString() { return Number.isNaN(+this) ? 'Invalid Date' : `${this.toDateString()} ${this.toTimeString()}`; }
  }
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  for (const field of ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
    Object.defineProperty(ZonedDate.prototype, `get${field}`, { configurable: true, writable: true,
      value() { return local(+this)[`getUTC${field}`](); },
    });
    if (field === 'Day') continue;
    Object.defineProperty(ZonedDate.prototype, `set${field}`, { configurable: true, writable: true,
      value(...args) {
        // setFullYear (and legacy setYear) recovers an invalid Date from epoch 0.
        const d = Number.isNaN(+this) && field === 'FullYear' ? new NativeDate(0) : local(+this);
        return this.setTime(instant(d[`setUTC${field}`](...args)));
      },
    });
  }
  for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    Object.defineProperty(ZonedDate.prototype, method, { configurable: true, writable: true,
      value(locales, options) {
        if (Number.isNaN(NativeDate.prototype.getTime.call(this))) return 'Invalid Date';
        return NativeDate.prototype[method].call(this, locales, optionsInZone(options));
      },
    });
  }
  function optionsInZone(options) {
    if (options === null) throw new TypeError('Date formatting options cannot be null');
    const result = Object.create(options === undefined ? null : Object(options));
    if (result.timeZone === undefined) Object.defineProperty(result, 'timeZone', { value: timeZone });
    return result;
  }
  const ZonedFormat = new Proxy(NativeFormat, {
    apply(target, self, [locales, options]) { return Reflect.apply(target, self, [locales, optionsInZone(options)]); },
    construct(target, [locales, options], newTarget) { return Reflect.construct(target, [locales, optionsInZone(options)], newTarget); },
  });
  const previousDate = globalThis.Date, previousFormat = Intl.DateTimeFormat;
  const restore = () => { globalThis.Date = previousDate; Intl.DateTimeFormat = previousFormat; };
  globalThis.Date = new Proxy(ZonedDate, { apply() { return new ZonedDate().toString(); } });
  Intl.DateTimeFormat = ZonedFormat;
  let pending = false;
  try {
    const result = run();
    if (result && typeof result.then === 'function') {
      const promise = Promise.resolve(result).finally(restore);
      pending = true;
      return promise;
    }
    return result;
  } finally {
    if (!pending) restore();
  }
}
