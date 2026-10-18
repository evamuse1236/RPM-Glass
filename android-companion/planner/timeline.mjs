/** Proportional day timeline. Empty stretches of two or more hours fold into one short row. */
import {localDay, dayRange, timelineItems} from '../planner-state.mjs';
import {el, button, icon} from './dom.mjs';
import {clock, duration, plural} from './format.mjs';
import {taskRow} from './task-row.mjs';
import {HOUR, openHours, segments, positionAt} from './day-geometry.mjs';

function hourSize() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour'));
  return Number.isFinite(value) && value > 0 ? value : 96;
}

const hoursOf = (range, time) => (time - range.start) / HOUR;
const positionOf = (layout, range, time) => positionAt(layout, hoursOf(range, time));

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
  const spans = rows.map(row => ({start: hoursOf(range, row.start), end: hoursOf(range, row.end)}));
  const layout = segments(openHours(spans, {now: isToday ? hoursOf(range, Date.now()) : null}), {size});
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
