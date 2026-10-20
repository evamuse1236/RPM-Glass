import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNotchData} from './notch-day.mjs';
import {notchScene, alertScene, WATER_SNOOZE, routineSnooze, PillPriority, controls, visibleRows, progress, heroValue} from './notch-scene.mjs';
import {anchor, G, D, innerRadius, faceTop, bandAt, pillRing, fits, faceScale, islandInset} from './notch-geometry.mjs';
import {S24} from './device.mjs';

const at = local => new Date(local + ':00+05:30').getTime();
const iso = local => new Date(at(local)).toISOString();
const task = (id, title, local, minutes) => ({id, title, raw: title, kind: 'plan', planned: iso(local), minutes, blockId: 'b1'});

function day(body, events = null) {
  const planner = {blocks: [{id: 'b1', title: 'Study'}]};
  if (body) planner.body = {
    water: {settings: {goal: 8}, glasses: [iso('2026-10-18T08:30'), iso('2026-10-18T10:30')]},
    routines: [{id: 'r1', name: 'Evening routine', start: '16:00', end: '17:00', days: [0],
      steps: [{id: 's1', title: 'Tidy desk'}, {id: 's2', title: 'Walk'}]}],
    meals: [],
  };
  const entries = [task(1, 'Write RM essay', '2026-10-18T15:30', 45), task(2, 'Call Prof. Rao', '2026-10-18T16:30', 30),
    task(3, 'Gym', '2026-10-18T19:00', 60)];
  return parseNotchData({version: 1, entries, planner}, events);
}
const scene = (data, local, snoozes = {}) => notchScene(data, at(local), snoozes, false);

test('a running task shows time left everywhere', () => {
  const s = scene(day(true), '2026-10-18T15:50');
  assert.equal(s.pillValue, '25m');
  assert.equal(s.heroTitle, 'Write RM essay');
  assert.equal(s.heroSubtitle, 'Study');
  assert.ok(Math.abs(s.progress - 20 / 45) < 0.001);
  assert.equal(s.spoken, 'Write RM essay, 25 min left');
  assert.ok(s.canDone);
});

test('the time shows once: the band has it, the line is the purpose, else the block, else Now or Next', () => {
  const data = day(true);
  for (const local of ['2026-10-18T15:50', '2026-10-18T16:20']) {
    const s = scene(data, local);
    assert.ok(!s.heroSubtitle.includes(s.pillValue) && !/\d/.test(s.heroSubtitle), `${local}: ${s.heroSubtitle}`);
  }
  const planner = {blocks: []};
  const entries = [{...task(1, 'Write RM essay', '2026-10-18T15:30', 45), purpose: ' So Sunday is calm ', blockId: null},
    {...task(2, 'Call Prof. Rao', '2026-10-18T16:30', 30), blockId: null}];
  const bare = parseNotchData({version: 1, entries, planner}, null);
  assert.equal(scene(bare, '2026-10-18T15:50').heroSubtitle, 'So Sunday is calm');
  assert.equal(scene(bare, '2026-10-18T16:20').heroSubtitle, 'Next');
});

test('between items the pill shows when the next starts', () => {
  const s = scene(day(false), '2026-10-18T16:20');
  assert.equal(s.pillValue, '4:30');
  assert.equal(s.heroSubtitle, 'Study');
  assert.equal(s.progress, 0);
});

test('rows are the next item, then due water, then the other nudges and the meal, at most three', () => {
  const s = scene(day(true), '2026-10-18T16:05');
  assert.deepEqual(s.rows.map(r => [r.look, r.title, r.value]),
    [['TASK', 'Call Prof. Rao', '4:30 PM'], ['WATER', 'Water', '2 of 8 · due'], ['HABIT', 'Evening routine', '0 of 2']]);
  assert.ok(s.waterDue);
});

test('without Body data only the day shows', () => {
  const s = scene(day(false), '2026-10-18T15:50');
  assert.equal(s.water, null);
  assert.equal(s.habit, null);
  assert.equal(s.meal, null);
  assert.equal(s.canLogMeal, false);
  assert.equal(s.canSnooze, false);
  assert.equal(s.rows.length, 2);
});

test('a snooze holds water and the routine', () => {
  const snoozes = {[WATER_SNOOZE]: at('2026-10-18T16:20'), [routineSnooze('r1')]: at('2026-10-18T16:20')};
  const held = scene(day(true), '2026-10-18T16:05', snoozes);
  assert.equal(held.waterDue, false);
  assert.equal(held.habit, null);
  assert.ok(scene(day(true), '2026-10-18T16:25', snoozes).waterDue);
});

test('a calendar event is fixed and a running task beats it', () => {
  const events = [{start: at('2026-10-18T15:00'), end: at('2026-10-18T18:00'), title: 'Seminar', allDay: false, busy: false}];
  assert.equal(scene(day(false, events), '2026-10-18T15:50').heroTitle, 'Write RM essay');
  const later = scene(day(false, events), '2026-10-18T17:30');
  assert.equal(later.heroTitle, 'Seminar');
  assert.equal(later.heroLook, 'EVENT');
  assert.equal(later.pillValue, '30m');
  assert.equal(later.canDone, false);
});

test('with no task left and water due, water is the hero', () => {
  const s = scene(day(true), '2026-10-18T21:00');
  assert.equal(s.hero, null);
  assert.equal(s.heroLook, 'WATER');
  assert.equal(s.heroSubtitle, 'Due now');
  assert.deepEqual([s.rows.at(-1).title, s.rows.at(-1).value], ['Dinner', 'Not logged']);
});

test('a new nudge leads for eight seconds, then the task returns and the nudge splits off', () => {
  const p = new PillPriority();
  p.update(scene(day(true), '2026-10-18T16:05'), 0);
  assert.equal(p.primary(1000).kind, 'HABIT');
  assert.equal(p.primary(9000).kind, 'TASK');
  assert.equal(p.secondary(9000).kind, 'HABIT');
});

test('the pill fits the measured status bar: 4dp above the hole, ending with the bar', () => {
  const a = anchor();
  assert.equal(a.top, 24 - Math.round(4 * S24.density));
  assert.equal(a.top + a.pill, S24.statusBarPx);
  assert.equal(a.centerX, S24.hole.centerX);
  assert.ok(Math.abs(S24.statusBarDp - 32.71) < 0.01);
});

function alertDay() {
  const entries = [task(1, 'Write RM essay', '2026-10-18T15:30', 45), {...task(2, 'Call the bank', '2026-10-18T16:30', 30), alertIntent: {type: 'reminder'}},
    {...task(3, 'Sit RM Quiz I', '2026-10-18T19:00', 60), alertIntent: {type: 'alarm'}}, {...task(4, 'Old reminder', '2026-10-18T09:00', 30), alertIntent: {type: 'reminder'}}];
  return parseNotchData({version: 1, entries, planner: {blocks: [{id: 'b1', title: 'Study'}]}}, null);
}

test('an alert shows the next task today that asked for it, else the hero', () => {
  const reminder = alertScene(alertDay(), at('2026-10-18T15:50'), 'reminder');
  assert.deepEqual([reminder.taskId, reminder.title, reminder.at, reminder.line], [2, 'Call the bank', '4:30 PM', 'Reminder']);
  const alarm = alertScene(alertDay(), at('2026-10-18T15:50'), 'alarm');
  assert.deepEqual([alarm.taskId, alarm.line], [3, 'Ringing']);
  assert.equal(alertScene(alertDay(), at('2026-10-18T19:30'), 'reminder').taskId, 3);
  assert.equal(alertScene(day(false), at('2026-10-18T15:50'), 'alarm').title, 'Write RM essay');
  assert.equal(alertScene(day(false), at('2026-10-18T23:00'), 'alarm'), null);
});

test('a reminder never says alarm', () => {
  for (const local of ['2026-10-18T15:50', '2026-10-18T19:30']) for (const data of [alertDay(), day(true)]) {
    const words = Object.values(alertScene(data, at(local), 'reminder')).join(' ');
    assert.doesNotMatch(words, /alarm|ringing/i);
  }
});

function alertRowsDay(callAlert) {
  const data = day(true);
  data.tasks.find(t => t.id === 2).alert = callAlert;
  data.tasks.find(t => t.id === 3).alert = 'alarm';
  return data;
}

test('the next alert leads the rows when nothing else shows it, and due water stays second', () => {
  const s = scene(alertRowsDay(''), '2026-10-18T16:05');
  assert.deepEqual([s.rows[0].look, s.rows[0].title, s.rows[0].value, s.rows[0].alert], ['ALARM', 'Gym', '7:00 PM', 'alarm']);
  assert.equal(s.rows[1].look, 'WATER');
  assert.ok(s.rows.length <= 3);
  assert.equal(s.rows[0].slot, s.nextAlert);
});

test('a task row whose alert is still to come carries its chip instead of a second row, and the hero shows its chip until it starts', () => {
  const s = scene(alertRowsDay('reminder'), '2026-10-18T16:05');
  assert.deepEqual([s.rows[0].look, s.rows[0].title, s.rows[0].alert], ['TASK', 'Call Prof. Rao', 'reminder']);
  assert.ok(s.rows.every(r => r.look !== 'REMINDER'));
  const before = scene(alertRowsDay('reminder'), '2026-10-18T16:20');
  assert.deepEqual([before.heroTitle, before.heroAlert, before.heroAt], ['Call Prof. Rao', 'reminder', '4:30 PM']);
  const during = scene(alertRowsDay('reminder'), '2026-10-18T16:40');
  assert.equal(during.heroAlert, '');
  assert.equal(during.nextAlert.task.id, 3);
});

test("the hero's own alert row leads the island's rows and never pushes due water out", () => {
  const s = scene(alertRowsDay('reminder'), '2026-10-18T16:20');
  assert.ok(s.waterDue);
  const own = visibleRows(s, 3)[0];
  assert.deepEqual([own.heros, own.title, own.value, own.alert], [true, 'Reminder', '4:30 PM', 'reminder']);
  for (let n = 1; n <= 3; n++) {
    const rows = visibleRows(s, n);
    assert.ok(rows.length <= n);
    assert.ok(controls(s).includes('GLASS') || rows.some(r => r.look === 'WATER'), `${n} rows`);
  }
});

test('the pill drops AM/PM within 12 hours', () => {
  assert.equal(scene(day(false), '2026-10-18T16:20').pillValue, '4:30');
  assert.equal(scene(day(false), '2026-10-18T03:00').pillValue, '3:30 PM');
  assert.equal(scene(day(false), '2026-10-18T03:31').pillValue, '3:30');
  assert.equal(notchScene(day(false), at('2026-10-18T16:20'), {}, true).pillValue, '16:30');
});

test('the ring fills per kind: time used, empty when upcoming, glasses, steps', () => {
  const running = scene(day(true), '2026-10-18T15:50');
  assert.ok(Math.abs(progress('TASK', running) - 20 / 45) < 0.001);
  const upcoming = scene(day(true), '2026-10-18T16:20');
  assert.equal(progress('TASK', upcoming), 0);
  assert.equal(progress('WATER', upcoming), 2 / 8);
  assert.equal(progress('HABIT', scene(day(true), '2026-10-18T16:05')), 0);
  assert.equal(heroValue(running), '25m');
  assert.equal(heroValue(scene(day(true), '2026-10-18T21:00')), '2/8');
});

test('the hero has one primary control, never greyed; Later only sits beside Glass', () => {
  assert.deepEqual(controls(scene(day(true), '2026-10-18T15:50')), ['DONE']);
  const events = [{start: at('2026-10-18T15:00'), end: at('2026-10-18T18:00'), title: 'Seminar', allDay: false, busy: false}];
  assert.deepEqual(controls(scene(day(false, events), '2026-10-18T17:30')), []);
  assert.deepEqual(controls(scene(day(true), '2026-10-18T21:00')), ['GLASS', 'LATER']);
});

test('the island always offers Glass, as the primary or as a row that stays when rows drop', () => {
  for (const local of ['2026-10-18T15:50', '2026-10-18T16:05', '2026-10-18T16:20', '2026-10-18T21:00']) {
    const s = scene(day(true), local);
    for (let n = 1; n <= 3; n++) {
      const rows = visibleRows(s, n);
      assert.ok(rows.length <= n);
      assert.ok(controls(s).includes('GLASS') || rows.some(r => r.look === 'WATER'), `${local} with ${n} rows`);
    }
  }
});

test('margins are 16dp on all four sides and every inner corner is 36 less its inset', () => {
  assert.equal(G.RADIUS_DP, 36);
  assert.equal(G.PAD_DP, 16);
  assert.equal(innerRadius(G.PAD_DP), 20);
  assert.equal(innerRadius(G.PAD_DP), G.CIRCLE_DP / 2);
  assert.equal(innerRadius(G.PAD_DP), G.CONTROL_DP / 2);
  const island = {x: 12, w: 360};
  const band = bandAt('open', island, 4);
  assert.equal(band.cx - band.d / 2 - island.x, 16);
  assert.equal(band.cy - band.d / 2 - 4, 16);
  assert.equal(island.x + island.w - band.valueRight, 16);
  assert.equal(faceTop(), 16 + 40 + 12);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.match(css, /--radius: 36px;/);
  assert.match(css, /--pad: 16px;/);
  assert.match(css, /--inner: calc\(var\(--radius\) - var\(--pad\)\);/);
  assert.match(css, /padding: calc\(var\(--pad\) \+ var\(--circle\) \+ 12px\) var\(--pad\) var\(--pad\);/);
  const pill = {x: 100, w: 140, h: 36};
  const ring = bandAt('pill', pill, 0);
  assert.equal(ring.d, 28);
  assert.equal(pill.h / 2 - (ring.cx - ring.d / 2 - pill.x), ring.d / 2, 'the ring is concentric with the pill: 18 - 4 = 14');
  assert.equal(pillRing(28), 20);
});

test('outer margins match: the islands sit as far in from each side as their top is down; the last control ends 16dp up', () => {
  assert.equal(islandInset(), anchor().top / D, 'S24: the side margin is the pill top');
  const shape = javaSource('IslandShape');
  assert.ok(shape.includes('return Math.max(dp(MIN_INSET_DP, density), Math.min(dp(MAX_INSET_DP, density), a.pillTop()));'));
  assert.ok(shape.includes('int x = inset(a, density);'));
  assert.ok(javaSource('NotchPill').includes('int w = displayWidth - 2 * IslandShape.inset(anchor, density);'));
  assert.equal(G.ROW_DP - G.CONTROL_DP, 4, 'a row is its 40dp control and 2dp above and below');
  assert.ok(javaSource('NotchParts').includes('lp.bottomMargin = -(dp(NotchGeometry.ROW_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;'));
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.notch-rows { margin-block: 12px calc((var(--circle) - 44px) / 2);'));
});

test('a wide notch keeps its whole width clear, as NotchAnchor does', () => {
  const wide = anchor({...S24, cutout: {left: 315, top: 0, right: 765, bottom: 84}, statusBarPx: 84});
  assert.equal(wide.hole, 450);
  assert.equal(wide.top, Math.round(2 * S24.density));
  assert.equal(anchor().hole, 68);
});

test('a face too tall for the screen drops rows, then shortens its title, and is never cut', () => {
  assert.deepEqual(fits(true), [{rows: 3, shortTitle: false}, {rows: 2, shortTitle: false}, {rows: 1, shortTitle: false}, {rows: 1, shortTitle: true}]);
  assert.deepEqual(fits(false), [{rows: 3, shortTitle: false}, {rows: 3, shortTitle: true}]);
  const view = readFileSync(new URL('./notch-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /for \(const fit of fits\(mode === 'open'\)\)/);
  assert.match(view, /h: Math\.max\(next\.offsetHeight, h\)/, 'the island is as tall as its face');
});

const javaSource = name => readFileSync(new URL(`../app/src/main/java/com/rpm/prototype/${name}.java`, import.meta.url), 'utf8');

test('every control shrinks to the same scale while pressed, on the phone and in the copy', () => {
  const motion = javaSource('NotchMotion');
  const scale = Number(motion.match(/PRESS_SCALE = ([\d.]+)f;/)[1]), ms = Number(motion.match(/PRESS_MS = (\d+);/)[1]);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  const pressed = css.match(/:is\(([^)]*)\):active \{ scale: ([\d.]+); \}/);
  assert.equal(Number(pressed[2]), scale);
  assert.match(css, new RegExp(`transition: scale ${ms}ms var\\(--ease\\)`));
  for (const part of ['.notch-pill-button', '.notch-row-tap', '.notch-circle-button', '.notch-undo', '.notch-words']) assert.ok(pressed[1].includes(part), part);
  const parts = javaSource('NotchParts');
  for (const method of ['View words(', 'View pill(', 'LinearLayout row(', 'View rowCircle(']) {
    const body = parts.slice(parts.indexOf(method), parts.indexOf('\n    }\n', parts.indexOf(method)));
    assert.match(body, /pressShrinks\(/, method);
  }
  assert.match(javaSource('NotchChangeViews'), /NotchParts\.pressShrinks\(undo\)/);
  assert.match(javaSource('IslandView'), /press\.target = NotchMotion\.PRESS_SCALE;/, 'the pill itself shrinks by the same amount');
});

test('the open island\'s title and line open the task, as the alert island\'s words do', () => {
  assert.match(javaSource('NotchContent'), /parts\.words\(scene\.heroTitle, scene\.heroSubtitle, accent, "Open " \+ scene\.heroTitle \+ " in the plan", actions::openHero\)/);
  assert.match(javaSource('NotchController'), /public void openHero\(\) \{\s+NotchController\.this\.openHero\(\);/);
  assert.match(readFileSync(new URL('./notch-view.mjs', import.meta.url), 'utf8'), /button\('notch-words', `Open \$\{scene\.heroTitle\} in the plan`, actions\.openHero\)/);
});

test('every row ends in one quiet 40dp circle, 16dp from the island\'s edge; water keeps its dots only at normal text', () => {
  const content = javaSource('NotchContent');
  const row = content.slice(content.indexOf('private View row('), content.indexOf('private View value('));
  const branches = row.split('return row;').slice(0, -1);
  assert.equal(branches.length, 5, 'hero alert, water, alert task, meal, task or routine');
  for (const b of branches) assert.equal(b.split('parts.trailCircle(').length - 1, b.includes('if (habit)') ? 2 : 1, 'one circle per row');
  assert.ok(!row.includes('value("Log"') && !row.includes('notch_ic_plus, NotchInk.WATER), plusAt'), 'no bare text or glyph controls');
  assert.ok(row.includes('if (!parts.largeText()) NotchParts.trail(row, new NotchParts.Dots('));
  const parts = javaSource('NotchParts');
  assert.ok(parts.includes('b.setBackground(states(outlined(Color.TRANSPARENT, r), outlined(NotchInk.PRESS, r)));'));
  assert.ok(javaSource('NotchInk').includes('static final int OUTLINE = 0x1FFFFFFF;'));
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.notch-row-circle { background: transparent; box-shadow: inset 0 0 0 1px var(--outline); }'));
  assert.ok(css.includes('--outline: oklch(100% 0 none / 0.12);'));
  const view = readFileSync(new URL('./notch-view.mjs', import.meta.url), 'utf8');
  const copy = view.slice(view.indexOf('function sceneRow('), view.indexOf('function openFace('));
  assert.equal(copy.split('rowCircle(').length - 1, 6, 'hero alert, water, alert task, meal, routine, task');
  assert.ok(copy.includes("...(fontScale > 1.3 ? [] : [dots])"));
  assert.equal(G.ROW_OUTSET_DP + 8, G.PAD_DP, 'rows reach 8dp past the margin and pad 8dp back in');
  assert.equal(innerRadius(G.PAD_DP), G.CONTROL_DP / 2, 'at a 16dp inset the 40dp circle is concentric with the island');
});

test('Undo and every pill keep their side padding: the inset background goes on before the padding', () => {
  const parts = javaSource('NotchParts');
  const shape = parts.slice(parts.indexOf('static void pillShape('), parts.indexOf('\n    }\n', parts.indexOf('static void pillShape(')));
  assert.ok(shape.indexOf('v.setBackground(') < shape.indexOf('v.setPadding('), 'setBackground with an InsetDrawable resets the padding');
  for (const name of ['NotchParts', 'NotchChangeViews', 'NotchAlertViews', 'NotchContent']) {
    const insets = javaSource(name).split('new InsetDrawable(').length - 1;
    assert.equal(insets, name === 'NotchParts' ? 2 : 0, `${name} draws pills only through pillShape`);
  }
  assert.match(javaSource('NotchChangeViews'), /NotchParts\.pillShape\(undo,/);
});

test('faces shrink with the island so they always fit inside it, on the phone and in the copy', () => {
  assert.equal(faceScale(360, 300, 360, 300), 1);
  assert.equal(faceScale(360, 300, 180, 300), 0.5);
  assert.equal(faceScale(360, 300, 360, 150), 0.5, 'the tighter side wins');
  assert.equal(faceScale(120, 40, 360, 300), 1, 'never drawn larger than it is');
  assert.equal(faceScale(0, 0, 360, 300), 1);
  const view = javaSource('IslandView');
  assert.ok(view.includes('IslandShape.faceScale(at.width(), at.height(), now.width(), now.height())'));
  assert.ok(view.includes('now = IslandShape.morph(from, to, t);'));
  assert.match(view, /f\.setPivotY\(0f\);/, 'from the top centre, under the camera');
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.match(css, /transform-origin: top center;/);
  assert.match(css, /scale: var\(--from-scale, 1\);/);
  const copy = readFileSync(new URL('./notch-view.mjs', import.meta.url), 'utf8');
  assert.ok(copy.includes("next.style.setProperty('--from-scale', String(faceScale(...measure(island, next), ...from)));"), 'set before the face enters');
  assert.ok(copy.indexOf("next.style.setProperty('--from-scale'") < copy.indexOf('island.append(next);'));
  assert.ok(copy.includes('shrinkLeaving(island, geo.w, geo.h);'));
});

test('opening widens first and closing narrows last, so the edge passes the status-bar clock in a few frames', () => {
  const share = Number(javaSource('IslandShape').match(/WIDTH_SHARE = ([\d.]+)f;/)[1]);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  const open = 350 * share, close = 300 * share;
  assert.ok(css.includes(`.island[data-motion="open"] { transition-duration: ${open}ms, ${open}ms, 350ms, 350ms, 350ms; }`));
  assert.ok(css.includes(`.island[data-motion="close"] { transition-duration: ${close}ms; transition-delay: ${close}ms, ${close}ms, 0s, 0s, 0s; }`));
  assert.match(css, /transition-property: inset-inline-start, inline-size, block-size, border-radius, box-shadow;/);
});

test('a changing digit rolls inside a box from its cap top to its baseline, so no glyph shows below the baseline', () => {
  const motion = javaSource('NotchMotion');
  const travel = Number(motion.match(/ROLL_TRAVEL = ([\d.]+)f;/)[1]), pad = Number(motion.match(/ROLL_PAD = ([\d.]+)f;/)[1]);
  assert.ok((travel - 1) * 0.7 > pad, 'a digit one travel away (cap ~0.7em) starts and ends fully outside the box');
  const band = javaSource('IslandBand');
  const roll = band.slice(band.indexOf('text.getTextBounds("0"'), band.indexOf('canvas.restore();'));
  assert.ok(roll.includes('float travel = cap * NotchMotion.ROLL_TRAVEL;'));
  assert.ok(roll.includes('canvas.clipRect(0f, baseline - cap - pad, right, baseline + pad);'));
  assert.ok(roll.includes('baseline - travel * out') && roll.includes('baseline + travel * (1f - in)'), 'both moving digits are inside the clip');
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`.notch-c { display: inline-block; position: relative; text-box: trim-both cap alphabetic; clip-path: inset(-${pad}em 0); }`));
  assert.ok(css.includes('.notch-o { position: absolute; inset: 0; opacity: 0; text-box: trim-both cap alphabetic; }'));
  const pct = Math.round(travel * 100);
  assert.ok(css.includes(`to { translate: 0 -${pct}%; opacity: 0; }`) && css.includes(`from { translate: 0 ${pct}%; opacity: 0; }`));
});

test('a primary control is filled with its accent and labelled dark, on the phone and in the copy', () => {
  const ink = javaSource('NotchInk');
  const share = Math.round(Number(ink.match(/ON_ACCENT_SHARE = ([\d.]+)f;/)[1]) * 100);
  const pressed = Math.round(Number(ink.match(/PRIMARY_PRESSED_SHARE = ([\d.]+)f;/)[1]) * 100);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`.notch-primary { background: var(--kc); color: var(--kc-ink, color-mix(in srgb, var(--kc) ${share}%, black)); }`));
  assert.ok(css.includes(`.notch-primary:active { background: color-mix(in srgb, var(--kc) ${pressed}%, black); }`));
  assert.ok(readFileSync(new URL('./notch-parts.mjs', import.meta.url), 'utf8').includes("if (primary && color === INK.ALARM) b.style.setProperty('--kc-ink', 'var(--alarm-ink)');"));
  assert.ok(ink.includes('return accent == ALARM ? ALARM_INK : intoBlack(accent, ON_ACCENT_SHARE);'));
});

test('a ringing alarm puts Stop across the width over Snooze 10 min and Done; a reminder keeps Done first', () => {
  const views = javaSource('NotchAlertViews');
  const alarm = views.slice(views.indexOf('View alarm('), views.indexOf('private View words('));
  const stop = alarm.indexOf('parts.controls(parts.pill(R.drawable.notch_ic_stop, "Stop"');
  assert.ok(stop > 0, 'Stop is a pill of its own');
  assert.ok(alarm.slice(stop).includes('NotchInk.ALARM, true,'), 'Stop is the primary');
  assert.ok(alarm.indexOf('"Snooze "') > stop && alarm.indexOf('"Done"') > alarm.indexOf('"Snooze "'), 'Snooze then Done under it');
  assert.ok(alarm.includes('NotchInk.ALARM, false, actions::doneAlert'), 'Done is a secondary on the alarm');
  assert.ok(alarm.includes('parts.pairUnder()'));
  assert.ok(!alarm.includes('rowCircle') && !alarm.includes('bandControl'), 'no Stop circle in the band');
  const reminder = views.slice(views.indexOf('View reminder('), views.indexOf('View alarm('));
  assert.ok(reminder.includes('"Done", "Done: " + alert.title, NotchInk.TASK, true'), 'a reminder keeps Done as its primary');
  const copy = readFileSync(new URL('./notch-alert.mjs', import.meta.url), 'utf8');
  assert.ok(copy.includes("controls(pill('notch_ic_stop', 'Stop', `Stop the alarm for ${alert.title}`, INK.ALARM, true, actions.stopAlert)),"));
  assert.ok(copy.includes("controls(snooze(alert, INK.ALARM, actions), pill('ic_check', 'Done'"));
  assert.ok(!copy.includes('notch-band-control'));
});

test('Undo shows its five seconds draining, on the phone and in the copy', () => {
  const ms = Number(javaSource('NotchReceipt').match(/UNDO_MS = ([\d_]+);/)[1].replace('_', ''));
  const ink = javaSource('NotchInk');
  const share = name => Math.round(Number(ink.match(new RegExp(`${name} = ([\\d.]+)f;`))[1]) * 100);
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`background: color-mix(in srgb, var(--task) ${share('UNDO_SHARE')}%, black);`));
  assert.ok(css.includes(`background: color-mix(in srgb, var(--task) ${share('UNDO_LEFT_SHARE')}%, black);\n  animation: notch-undo-left ${ms}ms linear forwards;`));
  assert.ok(css.includes(`.notch-undo:active { background: color-mix(in srgb, var(--task) ${share('UNDO_PRESSED_SHARE')}%, black); }`));
  assert.ok(css.includes('@keyframes notch-undo-left { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 100% 0 0); } }'), 'drains from end to start');
});

test('a row title keeps the phone\'s line count in the copy: 1 line, 2 at large text, 3 at max', () => {
  const parts = javaSource('NotchParts');
  assert.match(parts, /setMaxLines\(fontScale\(\) >= MAX_TEXT \? normal \+ 2 : largeText\(\) \? normal \+ 1 : normal\)/);
  assert.match(parts, /TextView name = wrapping\(title, 15, NotchInk\.WHITE_87, 400, 1\);/, 'a row title starts at one line');
  const css = readFileSync(new URL('./notch.css', import.meta.url), 'utf8');
  const clamp = rule => Number(css.slice(css.indexOf(rule)).match(/line-clamp: (\d+);/)[1]);
  assert.equal(clamp('.notch-row-title {'), 1);
  assert.equal(clamp('.notch-stage[data-text="large"] .notch-row-title {'), 2);
  assert.equal(clamp('.notch-stage[data-text="max"] .notch-row-title {'), 3);
});

test('the copy uses the phone\'s sizes: NotchGeometry.java and notch-geometry.mjs match', () => {
  const java = readFileSync(new URL('../app/src/main/java/com/rpm/prototype/NotchGeometry.java', import.meta.url), 'utf8');
  const constants = Object.fromEntries([...java.matchAll(/static final (?:int|float) (\w+) = ([\d.]+)f?;/g)].map(([, k, v]) => [k, Number(v)]));
  for (const [k, v] of Object.entries(G)) assert.equal(constants[k], v, k);
  assert.ok(Object.keys(G).length >= 20);
});
