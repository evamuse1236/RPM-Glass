/** Lays the timeline out on a clock grid for a wide window: each row's top and height follow its time, and rows that overlap share the width in lanes. */
import {MIN, gutterTime} from '../day-parts.mjs';
import {clockText} from '../body-state.mjs';

export const GRID_SCALE = 1.2;
const HOUR = 60 * MIN;
const MIN_PX = 24;
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const NOW_REACH = 2 * HOUR;

const floorHour = at => { const d = new Date(at); d.setMinutes(0, 0, 0); return +d; };
const ceilHour = at => { const f = floorHour(at); return f === at ? at : f + HOUR; };
const atHour = (day, hour) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00`);

function lanes(rows, endOf) {
  const sorted = rows.toSorted((a, b) => a.start - b.start || endOf(b) - endOf(a));
  let cluster = [], reach = -Infinity;
  const close = () => { const count = Math.max(...cluster.map(r => r.lane)) + 1; for (const r of cluster) r.lanes = count; cluster = []; };
  for (const row of sorted) {
    if (row.start >= reach && cluster.length) close();
    const taken = new Set(cluster.filter(r => endOf(r) > row.start).map(r => r.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    row.lane = lane;
    cluster.push(row);
    reach = Math.max(reach, endOf(row));
  }
  if (cluster.length) close();
}

/** The model from buildSpine with `top`, `height`, `lane` and `lanes` on each row, and `grid` holding the range and hour lines; null `grid` keeps the list. */
export function gridLayout(model, {day, now, live, scale = GRID_SCALE}) {
  const items = model.rows.filter(r => r.kind !== 'gap' && r.kind !== 'now').map(r => ({...r}));
  if (!items.length) return {...model, grid: null};
  const endOf = r => Math.max(r.end ?? r.start, r.start + (MIN_PX / scale) * MIN);
  let start = Math.min(floorHour(Math.min(...items.map(r => r.start))), atHour(day, FIRST_HOUR));
  let end = Math.max(ceilHour(Math.max(...items.map(endOf))), atHour(day, LAST_HOUR));
  const showNow = live && now >= start - NOW_REACH && now <= end + NOW_REACH;
  if (showNow) { start = Math.min(start, floorHour(now)); end = Math.max(end, ceilHour(now)); }
  const px = at => Math.round((at - start) / MIN * scale);
  const gaps = model.rows.filter(r => r.kind === 'gap' && r.plan != null).map(r => ({...r, lane: 0, lanes: 1}));
  lanes(items, endOf);
  const rows = [...gaps, ...items].map(r => ({...r, top: px(r.start), height: Math.max(MIN_PX, px(endOf(r)) - px(r.start))}))
    .toSorted((a, b) => a.start - b.start);
  if (showNow) rows.push({kind: 'now', key: 'now', start: now, end: now, time: gutterTime(now), label: clockText(now), top: px(now)});
  const hours = [];
  for (let at = start; at <= end; at += HOUR) hours.push({at, top: px(at), label: gutterTime(at)});
  return {...model, rows, nowKey: showNow ? 'now' : null, shape: `${model.shape}|${start}-${end}`, grid: {start, end, span: px(end), hour: 60 * scale, hours}};
}
