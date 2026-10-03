/** Proportional day timeline. Empty stretches of two or more hours fold into one short row. */
import {localDay, dayRange, timelineItems} from '../planner-state.mjs';
import {el, button, icon} from './dom.mjs';
import {clock, duration, plural} from './format.mjs';
import {taskRow} from './task-row.mjs';

const HOUR = 3600000;
const FOLD_HEIGHT = 40;

function hourSize() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
  return Number.isFinite(value) && value > 0 ? value : 96;
}

/** Hours that hold an item, the current hour, and one hour of context either side stay open. */
function openHours(rows, range, showNow) {
  const open = new Array(24).fill(false);
  const mark = (start, end) => {
    const first = Math.max(0, Math.floor((start - range.start) / HOUR) - 1);
    const last = Math.min(23, Math.ceil((end - range.start) / HOUR));
    for (let h = first; h <= last; h++) open[h] = true;
  };
  for (const row of rows) mark(row.start, row.end);
  if (showNow) mark(Date.now(), Date.now());
  if (!open.some(Boolean)) for (let h = 8; h <= 18; h++) open[h] = true;
  return open;
}

/** Build segments: {open:true,h} for each visible hour, or {open:false,from,to} for folds. */
function segments(open) {
  const list = [];
  let h = 0;
  while (h < 24) {
    if (open[h]) {
      list.push({open: true, from: h, to: h + 1});
      h++;
      continue;
    }
    let end = h;
    while (end < 24 && !open[end]) end++;
    if (end - h === 1) list.push({open: true, from: h, to: end});
    else list.push({open: false, from: h, to: end});
    h = end;
  }
  let y = 0;
  const size = hourSize();
  for (const segment of list) {
    segment.y = y;
    segment.height = segment.open ? size : FOLD_HEIGHT;
    y += segment.height;
  }
  return {list, height: y, size};
}

function positionOf(layout, range, time) {
  const hours = (time - range.start) / HOUR;
  const hit = layout.list.find(s => hours >= s.from && hours < s.to) ?? layout.list.at(-1);
  if (!hit.open) return hit.y;
  return hit.y + (hours - hit.from) * layout.size;
}

function fitCard(node) {
  const style = getComputedStyle(node);
  const title = node.querySelector('.timed-title');
  const meta = node.querySelector('.timed-meta');
  const available = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const titleLine = parseFloat(getComputedStyle(title).lineHeight);
  const metaLine = parseFloat(getComputedStyle(meta).lineHeight);
  meta.hidden = available < titleLine + metaLine;
  const lines = Math.floor((available - (meta.hidden ? 0 : metaLine)) / titleLine);
  title.style.setProperty('--title-lines', String(Math.max(1, Math.min(3, lines))));
}

function hourLabel(hour) {
  const date = new Date(2000, 0, 1, hour % 24);
  return date.toLocaleTimeString([], {hour: 'numeric'});
}

function drawRuler(canvas, layout, range, isToday) {
  for (const segment of layout.list) {
    if (!segment.open) {
      const fold = el('div', 'timeline-fold');
      fold.style.setProperty('--y', segment.y + 'px');
      fold.append(icon('unfold_more'), el('span', '', `${hourLabel(segment.from)} – ${hourLabel(segment.to)} · ` +
        plural(segment.to - segment.from, 'free hour')));
      canvas.append(fold);
      continue;
    }
    const line = el('div', 'hour-line');
    line.style.setProperty('--y', segment.y + 'px');
    const label = el('span', 'hour-label tnum', hourLabel(segment.from));
    const near = isToday && Math.abs(range.start + segment.from * HOUR - Date.now()) < 12 * 60000;
    label.hidden = near;
    line.append(label);
    canvas.append(line);
  }
}

function drawItem(app, canvas, layout, range, item) {
  const calendarItem = item.source === 'calendar';
  const node = el('article', 'timed' + (calendarItem ? ' external' : ''));
  const area = calendarItem ? null : app.context(item).area;
  node.dataset.tone = calendarItem ? 'neutral' : app.tone(area);
  const top = positionOf(layout, range, Math.max(item.start, range.start));
  const bottom = positionOf(layout, range, Math.min(item.end, range.end));
  node.style.setProperty('--y', top + 'px');
  node.style.setProperty('--h', Math.max(44, bottom - top - 2) + 'px');
  node.style.setProperty('--lane', String(item.lane));
  node.style.setProperty('--lanes', String(item.lanes));
  const open = button('', () => (calendarItem
    ? app.actions.calendarDetails(item)
    : app.actions.openTask(item.id, item.occurrence)), 'timed-open');
  const blockTitle = calendarItem ? 'Calendar' : app.context(item).block?.title ?? 'No block';
  const minutes = Math.round((item.end - item.start) / 60000);
  open.append(el('span', 'timed-title', item.title),
    el('span', 'timed-meta tnum', `${clock(item.start)} · ${duration(minutes)} · ${blockTitle}`));
  open.setAttribute('aria-label', `${item.title}, ${clock(item.start)}, ${duration(minutes)}, part of ${blockTitle}`);
  node.append(open);
  canvas.append(node);
}

export function renderTimeline(app, page, active) {
  const {day, calendar} = app.state;
  const range = dayRange(day);
  range.end = range.start + 24 * HOUR;
  const isToday = day === localDay();
  const size = hourSize();
  const rows = timelineItems(app.data(), day, calendar, 44 / size * 60)
    .filter(item => item.source === 'calendar' || active.some(task => task.id === item.id))
    .filter(item => item.start < range.end);
  const layout = segments(openHours(rows, range, isToday));
  const canvas = el('div', 'timeline');
  canvas.style.setProperty('--timeline-height', layout.height + 'px');
  drawRuler(canvas, layout, range, isToday);
  for (const item of rows) drawItem(app, canvas, layout, range, item);
  if (isToday) {
    const now = el('div', 'now-line');
    now.style.setProperty('--y', positionOf(layout, range, Date.now()) + 'px');
    now.append(el('span', 'now-dot'));
    now.setAttribute('aria-label', 'Now, ' + clock(Date.now()));
    canvas.append(now);
  }
  page.append(canvas);
  requestAnimationFrame(() => canvas.querySelectorAll('.timed-open').forEach(fitCard));

  const anytime = active.filter(task => !task.start);
  if (!anytime.length) return;
  const section = el('section', 'result-group anytime-group');
  const head = el('div', 'result-head static');
  head.append(icon('schedule', {cls: 'result-icon'}));
  const copy = el('span', 'result-copy');
  copy.append(el('span', 'result-title', 'Anytime'), el('span', 'result-purpose', 'No time set for these'));
  head.append(copy);
  section.append(head);
  for (const task of anytime) {
    section.append(taskRow(app, task, {anytime: true, context: app.context(task).block?.title ?? 'No block'}));
  }
  page.append(section);
}
