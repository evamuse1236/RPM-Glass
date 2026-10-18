import {prefs, setPrefs} from './store.mjs';

const CALENDAR = {id: 1, title: 'Sample calendar', google: false};
const SAMPLE = [[0, '09:00', '10:30', 'Lecture'], [0, '14:00', '15:00', 'Team meeting'], [1, '11:00', '11:30', 'Dentist'],
  [2, '15:00', '17:00', 'Workshop'], [4, '18:00', '19:00', 'Football practice']];
const DAY = 864e5;

const startOfDay = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const at = (day, hm) => { const d = new Date(day); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };

export function calendarList() {
  const p = prefs();
  return {permitted: p.calendarPermitted, selected: p.calendarSelected, calendars: p.calendarPermitted ? [CALENDAR] : []};
}

export function calendarSelect({ids}) {
  if (!Array.isArray(ids)) throw new Error('Calendar selection changed. Reopen Calendar.');
  if (ids.length > 60) throw new Error('Select fewer calendars.');
  const available = new Set(calendarList().calendars.map(c => c.id));
  if (ids.some(id => !available.has(id)) || new Set(ids).size !== ids.length) throw new Error('Calendar selection changed. Reopen Calendar.');
  setPrefs({calendarSelected: ids});
  return {};
}

export function calendarRead({anchor = Date.now()}) {
  if (anchor < 946684800000 || anchor > 7289654400000) throw new Error('Choose a date between 2000 and 2200.');
  const p = prefs();
  if (!p.calendarPermitted) return {status: 'permission_needed', configured: p.calendarSelected.length > 0, events: []};
  if (!p.calendarSelected.includes(CALENDAR.id)) return {status: 'not_selected', events: []};
  const day = startOfDay(anchor), start = day - 3 * DAY, end = day + 22 * DAY, today = startOfDay(Date.now());
  const events = SAMPLE.map(([offset, from, until, title], i) => {
    const begin = at(today + offset * DAY, from);
    return {id: `calendar-${i + 1}-${begin}`, start: begin, end: at(today + offset * DAY, until), title, calendarId: CALENDAR.id, allDay: false, busy: true};
  }).filter(e => e.start < end && e.end > start);
  return {status: 'ready', events, start, end, readAt: Date.now(), source: 'Android-synced calendars'};
}

export const grantCalendar = () => setPrefs({calendarPermitted: true});
