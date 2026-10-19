// Copy of NotchScene and PillPriority: the phone runs the Java, so change both together.
import {today, hero as pickHero, after, running, minutes, spoken, clock, waterStatus, routines, routineDue, unloggedMeal, slotName} from './notch-day.mjs';

export const WATER_SNOOZE = 'water';
export const ALERT_SNOOZE_MINUTES = 10;
export const routineSnooze = id => 'routine:' + id;

/** The alert an occurrence still has to give: its type until it starts, else ''. */
export const alertAt = (slot, now) => slot.start > now && !slot.task.fixed ? slot.task.alert ?? '' : '';
export const alertLook = alert => alert === 'alarm' ? 'ALARM' : 'REMINDER';
export const alertName = alert => alert === 'alarm' ? 'Ringing alarm' : 'Reminder';

const slotRow = (s, now, h24) => ({look: s.task.fixed ? 'EVENT' : 'TASK', title: s.task.title, value: clock(s.start, h24), slot: s, alert: alertAt(s, now)});

export function notchScene(data, now, snoozes = {}, h24 = false) {
  const snooze = key => snoozes[key] ?? 0;
  const slots = today(data.tasks, now);
  const hero = pickHero(slots, now);
  const isRunning = !!hero && running(hero, now);
  const body = data.body;
  const water = body.present ? waterStatus(body.glasses, body.water, data.busy, Math.max(body.waterSnoozedUntil, snooze(WATER_SNOOZE)), now) : null;
  const habit = (body.present ? routines(body, now) : []).find(r => routineDue(r, now) && snooze(routineSnooze(r.routine.id)) <= now) ?? null;
  const meal = body.present ? unloggedMeal(body.meals, now) : null;
  const waterDue = !!water?.pending;
  const s = {hero, running: isRunning, water, habit, meal, waterDue, snoozeMinutes: body.water.snoozeMinutes, canLogMeal: body.present, rows: []};
  s.heroAlert = hero ? alertAt(hero, now) : '';
  s.heroAt = hero ? clock(hero.start, h24) : '';
  s.nextAlert = slots.find(slot => alertAt(slot, now)) ?? null;

  if (hero) {
    s.heroLook = hero.task.fixed ? 'EVENT' : 'TASK';
    s.heroTitle = hero.task.title;
    const block = hero.task.block ? hero.task.block + ' · ' : '';
    if (isRunning) {
      s.pillValue = minutes(hero.end - now);
      s.heroSubtitle = block + spoken(hero.end - now) + ' left';
      s.barStart = minutes(Math.max(60_000, now - hero.start));
      s.barEnd = '-' + s.pillValue;
      s.progress = (now - hero.start) / (hero.end - hero.start);
      s.spoken = `${hero.task.title}, ${spoken(hero.end - now)} left`;
    } else {
      const at = clock(hero.start, h24);
      s.pillValue = at;
      s.heroSubtitle = `${block}${at}, in ${spoken(hero.start - now)}`;
      s.barStart = at;
      s.barEnd = minutes(hero.end - hero.start);
      s.progress = 0;
      s.spoken = `Next: ${hero.task.title} at ${at}`;
    }
  } else if (waterDue || !habit) {
    s.heroLook = 'WATER';
    s.heroTitle = 'Water';
    s.heroSubtitle = water ? `${water.count} of ${water.goal} glasses today${waterDue ? ' · due now' : ''}` : '';
    s.barStart = water ? String(water.count) : '';
    s.barEnd = water ? String(water.goal) : '';
    s.progress = water ? Math.min(1, water.count / water.goal) : 0;
  } else {
    s.heroLook = 'HABIT';
    s.heroTitle = habit.routine.name;
    s.heroSubtitle = habit.nextStep == null ? `${habit.done}/${habit.total} done` : 'Next: ' + habit.nextStep;
    s.barStart = String(habit.done);
    s.barEnd = String(habit.total);
    s.progress = habit.done / habit.total;
  }

  const later = after(slots, hero, 3);
  if (later.length) s.rows.push(slotRow(later[0], now, h24));
  if (habit && s.heroLook !== 'HABIT') s.rows.push({look: 'HABIT', title: habit.routine.name, value: `${habit.done} of ${habit.total}`});
  if (water && s.heroLook !== 'WATER') s.rows.push({look: 'WATER', title: 'Water', value: `${water.count} of ${water.goal}${water.pending ? ' · due' : ''}`});
  if (meal) s.rows.push({look: 'MEAL', title: slotName(meal), value: 'Not logged'});
  for (let i = 1; i < later.length && s.rows.length < 3; i++) s.rows.push(slotRow(later[i], now, h24));
  const next = s.nextAlert;
  if (next && next !== hero && later[0] !== next) {
    s.rows.unshift({look: alertLook(next.task.alert), title: next.task.title, value: clock(next.start, h24), slot: next, alert: next.task.alert});
  }
  const dueRow = s.rows.findIndex((r, i) => i >= 2 && r.look === 'WATER');
  if (dueRow >= 2 && waterDue) s.rows.splice(1, 0, ...s.rows.splice(dueRow, 1));
  s.rows.length = Math.min(s.rows.length, 3);
  s.canDone = !!hero && !hero.task.fixed;
  s.canSnooze = waterDue || !!habit;
  return s;
}

/** What an alert island says: the next task today that asked for this alert, else the hero. A reminder never says "alarm". */
export function alertScene(data, now, type, h24 = false) {
  const slots = today(data.tasks, now);
  const slot = slots.find(s => s.task.alert === type && s.end > now) ?? pickHero(slots, now);
  if (!slot) return null;
  const {title, id} = slot.task, at = clock(slot.start, h24);
  if (type === 'alarm') return {type, taskId: id, title, at, line: `Ringing · ${at}`, spoken: `Ringing: ${title}, ${at}`};
  return {type, taskId: id, title, at, line: `Reminder · ${at}`, spoken: `Reminder: ${title}, ${at}. Opens the task.`};
}

const EMPHASIS_MS = {TASK: 0, WATER: 8_000, HABIT: 8_000};
const KINDS = ['TASK', 'WATER', 'HABIT'];

export class PillPriority {
  slots = new Map();

  show(kind, text, now) {
    const old = this.slots.get(kind);
    this.slots.set(kind, {kind, text, postedAt: old ? old.postedAt : now});
  }

  dismiss(kind) { this.slots.delete(kind); }

  ordered() { return KINDS.map(k => this.slots.get(k)).filter(Boolean); }

  emphasized(item, now) { return item.kind !== 'TASK' && now < item.postedAt + EMPHASIS_MS[item.kind]; }

  primary(now) {
    let lead = null;
    for (const item of this.ordered()) if (this.emphasized(item, now)) lead = item;
    if (lead) return lead;
    if (this.slots.has('TASK')) return this.slots.get('TASK');
    return this.ordered().at(-1) ?? null;
  }

  secondary(now) {
    const first = this.primary(now);
    if (!first) return null;
    if (first.kind !== 'TASK' && this.slots.has('TASK')) return this.slots.get('TASK');
    return this.ordered().filter(item => item.kind !== first.kind).at(-1) ?? null;
  }

  nextChangeAt(now) {
    const ends = this.ordered().filter(item => this.emphasized(item, now)).map(item => item.postedAt + EMPHASIS_MS[item.kind]);
    return ends.length ? Math.min(...ends) : Infinity;
  }

  update(scene, now) {
    if (scene.hero) this.show('TASK', scene.pillValue, now); else this.dismiss('TASK');
    if (scene.waterDue) this.show('WATER', `${scene.water.count}/${scene.water.goal}`, now); else this.dismiss('WATER');
    if (scene.habit) this.show('HABIT', `${scene.habit.done}/${scene.habit.total}`, now); else this.dismiss('HABIT');
  }
}
