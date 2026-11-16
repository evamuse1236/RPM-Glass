import test from 'node:test';
import assert from 'node:assert/strict';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {localDay} from './planner-state.mjs';
import {bodyApi} from './planner/body-api.mjs';
import {refreshCalendar} from './planner/calendar-ui.mjs';
import {scheduleCheck} from './planner/sheet-parts.mjs';

const DAY = 86400000;

// The phone's calendarRead keeps events in [anchor day - 3 d, anchor day + 22 d) (PlannerCalendar.java), like the notch.
function fakeApp(events) {
  const data = freshStore();
  const reads = [];
  const native = async (name, {anchor}) => {
    assert.equal(name, 'calendarRead');
    reads.push(anchor);
    const midnight = new Date(anchor); midnight.setHours(0, 0, 0, 0);
    const start = +midnight - 3 * DAY, end = +midnight + 22 * DAY;
    return {status: 'ready', configured: true, start, end, events: events.filter(e => e.end > start && e.start < end)};
  };
  const app = {
    saving: false, data: () => data, current: () => null, render() {}, dom: {sheet: {hidden: true}},
    state: {tab: 'today', day: localDay(new Date(Date.now() + 5 * DAY)), calendar: []},
    api: {native}, commit: async () => {},
  };
  return {app, reads};
}

const meetingNow = () => {
  const now = Date.now();
  return {id: 'cal-1', title: 'Ward round', start: now - 30 * 60000, end: now + 60 * 60000, busy: true};
};

test('water keeps the busy meeting now while Today shows a day 5 days ahead, as the notch does', async () => {
  const meeting = meetingNow();
  const {app} = fakeApp([meeting]);
  await refreshCalendar(app);
  assert.ok(!app.state.calendar.some(e => e.id === 'cal-1'), 'the viewed day window does not hold today');
  assert.deepEqual(bodyApi(app).water().busy.map(e => e.title), ['Ward round']);
});

test('water keeps the busy meeting now after a clash check reads a calendar window weeks away', async () => {
  const meeting = meetingNow();
  const {app} = fakeApp([meeting]);
  app.state.day = localDay(new Date());
  await refreshCalendar(app);
  await scheduleCheck(app, null, {title: 'Later', planned: new Date(Date.now() + 21 * DAY).toISOString(), minutes: 30});
  assert.deepEqual(bodyApi(app).water().busy.map(e => e.title), ['Ward round']);
});

test('on the usual Today view the calendar is read once', async () => {
  const {app, reads} = fakeApp([meetingNow()]);
  app.state.day = localDay(new Date());
  await refreshCalendar(app);
  assert.equal(reads.length, 1);
  assert.deepEqual(bodyApi(app).water().busy.map(e => e.title), ['Ward round']);
});
