/** A day drawn to scale, without the DOM: which hours stay open, folds for empty stretches, the y of a time, lanes. */
export const HOUR = 3600000;
export const FOLD_HEIGHT = 40;

/**
 * Hours that hold an item, the current hour, and one hour of context either side stay open. `spans` are
 * {start, end} in hours after midnight; only hours in [from, to) can open. `fallback` opens a range when nothing does.
 */
export function openHours(spans, {from = 0, to = 24, now = null, fallback = [8, 18]} = {}) {
  const open = new Array(24).fill(false);
  const mark = (start, end) => {
    const first = Math.max(from, Math.floor(start) - 1);
    const last = Math.min(to - 1, Math.ceil(end));
    for (let h = first; h <= last; h++) open[h] = true;
  };
  for (const span of spans) mark(span.start, span.end);
  if (now != null) mark(now, now);
  if (fallback && !open.some(Boolean)) for (let h = fallback[0]; h <= fallback[1]; h++) open[h] = true;
  return open;
}

/** Segments from `from` to `to`: {open:true} per visible hour, {open:false} for two or more closed hours in a row. */
export function segments(open, {from = 0, to = 24, size, foldHeight = FOLD_HEIGHT}) {
  const list = [];
  let h = from;
  while (h < to) {
    if (open[h]) {
      list.push({open: true, from: h, to: h + 1});
      h++;
      continue;
    }
    let end = h;
    while (end < to && !open[end]) end++;
    list.push({open: end - h === 1, from: h, to: end});
    h = end;
  }
  let y = 0;
  for (const segment of list) {
    segment.y = y;
    segment.height = segment.open ? size : foldHeight;
    y += segment.height;
  }
  return {list, height: y, size};
}

/** The y of `hours` after midnight; a time inside a fold sits at the fold's top. */
export function positionAt(layout, hours) {
  const first = layout.list[0];
  if (hours < first.from) return first.y;
  const hit = layout.list.find(s => hours >= s.from && hours < s.to) ?? layout.list.at(-1);
  if (!hit.open) return hit.y;
  return hit.y + (hours - hit.from) * layout.size;
}

/**
 * Overlapping rows share lanes so no commitment hides behind another. Rows are sorted by start and carry
 * `visualEnd`. Lanes past `maxLanes` hide; each group with hidden rows becomes one "+N more".
 */
export function assignLanes(rows, {maxLanes = Infinity} = {}) {
  const more = [];
  let group = [], until = -Infinity;
  const finish = () => {
    const ends = [];
    for (const row of group) {
      let lane = ends.findIndex(end => end <= row.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = row.visualEnd;
      row.lane = lane;
    }
    const hidden = group.filter(row => row.lane >= maxLanes);
    for (const row of group) {
      row.lanes = Math.min(ends.length, maxLanes);
      row.hidden = row.lane >= maxLanes;
    }
    if (hidden.length) more.push({start: hidden[0].start, count: hidden.length, rows: [...group]});
    group = [];
  };
  for (const row of rows) {
    if (row.start >= until) {
      finish();
      until = row.visualEnd;
    } else until = Math.max(until, row.visualEnd);
    group.push(row);
  }
  finish();
  return {rows, more};
}
