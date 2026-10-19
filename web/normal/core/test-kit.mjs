import fs from 'node:fs';

export const fixture = () => JSON.parse(fs.readFileSync(new URL('../../fixtures/snapshot.json', import.meta.url), 'utf8'));
export const NOW = Date.parse('2026-10-19T10:15:00+05:30');

/** Timers that only fire when the test says so. */
export function fakeTimers() {
  let queue = [], next = 1;
  return {
    setTimeout(fn, ms) { const id = next++; queue.push({id, fn, ms}); return id; },
    clearTimeout(id) { queue = queue.filter(t => t.id !== id); },
    setInterval() { return 0; },
    clearInterval() {},
    get size() { return queue.length; },
    run() {
      while (queue.length) {
        const due = queue;
        queue = [];
        for (const t of due) t.fn();
      }
    },
  };
}

export const settle = () => new Promise(resolve => setImmediate(resolve));
