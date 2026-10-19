/** Deep links into the planner from Capture, notifications, native settings and the notch. */
import {stableKey} from './format.mjs';
import {openTask} from './task-sheets.mjs';
import {contextEditor, entityEditor} from './entities.mjs';
import {calendarEditor} from './calendar-ui.mjs';
import {aiAction} from './jev.mjs';
import {completeFromNotch, openMealFromNotch, drinkFromNotch} from './notch-link.mjs';

/** A Goal drafted by Capture: keeps the exact source words; entity fields stay within limits. */
export function capturedGoalDraft(target) {
  if (target?.view !== 'life' || !target.draft || typeof target.draft !== 'object') return null;
  const draft = target.draft;
  const sourceRaw = typeof draft.sourceRaw === 'string' ? draft.sourceRaw : '';
  const title = typeof draft.title === 'string' ? draft.title : '';
  const year = Number(draft.year);
  if (!sourceRaw || !title.trim() || !Number.isInteger(year) || year < 2000 || year > 2200) return null;
  const horizon = ['yearly', 'quarterly', 'monthly'].includes(draft.horizon) ? draft.horizon : 'yearly';
  return {
    key: 'goal-capture:' + stableKey(`${title}\n${year}\n${sourceRaw}`),
    sourceRaw,
    values: {
      title: title.slice(0, 200),
      purpose: typeof draft.purpose === 'string' ? draft.purpose.slice(0, 8000) : '',
      notes: typeof draft.notes === 'string' ? draft.notes.slice(0, 8000) : '',
      areaId: draft.areaId ?? null,
      year,
      horizon,
      period: draft.period ?? null,
    },
  };
}

/** UUID entities dispatch by collection; tasks need numeric ids. */
export function savedPlannerTarget(target) {
  if (target?.id == null) return null;
  const collection = target.collection ?? ({rpm: 'blocks', projects: 'projects', life: 'goals'}[target.view]);
  if (['blocks', 'projects', 'goals', 'areas'].includes(collection)) return {collection, id: target.id};
  if ((collection == null || collection === 'tasks') && typeof target.id === 'number') return {collection: 'tasks', id: target.id};
  return null;
}

const SETTINGS_VIEWS = ['settings', 'alarm_sound', 'reminder_sound', 'ai_connection', 'notifications', 'exact_alarms',
  'import_export'];
const VIEW_TABS = {day: 'today', meal: 'today', water: 'today', rpm: 'blocks', projects: 'projects', life: 'life'};

function openSaved(app, saved) {
  const {state} = app;
  const p = app.p();
  const exists = collection => p[collection].some(item => item.id === saved.id);
  if (saved.collection === 'blocks') {
    if (exists('blocks')) app.openBlock(saved.id);
    else app.notice('This Block is no longer available.');
  } else if (saved.collection === 'projects') {
    if (exists('projects')) app.openProject(saved.id);
    else app.notice('This Project is no longer available.');
  } else if (saved.collection === 'goals') {
    const goal = p.goals.find(g => g.id === saved.id);
    if (!goal) return app.notice('This Goal is no longer available.');
    Object.assign(state, {year: goal.year, lifeFilter: goal.areaId ?? null, horizon: goal.horizon ?? 'yearly',
      tab: 'life', stack: []});
    if (goal.horizon === 'quarterly') state.period = (goal.period - 1) * 3 + 1;
    else if (goal.period) state.period = goal.period;
    app.openGoal(goal.id);
  } else if (saved.collection === 'areas') {
    if (!exists('areas')) return app.notice('This Area is no longer available.');
    Object.assign(state, {lifeFilter: saved.id, tab: 'life', stack: []});
    app.openArea(saved.id);
  } else {
    openTask(app, saved.id);
  }
  return undefined;
}

/** Deep links from Capture, notifications and native settings. */
export function openView(app, target) {
  const {state} = app;
  const draft = capturedGoalDraft(target);
  if (draft) {
    Object.assign(state, {year: draft.values.year, horizon: draft.values.horizon, lifeFilter: draft.values.areaId ?? null,
      tab: 'life', stack: []});
    if (draft.values.horizon === 'quarterly') state.period = (Number(draft.values.period || 1) - 1) * 3 + 1;
    else if (draft.values.period) state.period = Number(draft.values.period);
    app.render({reset: true});
    entityEditor(app, 'goals', null, draft.values, draft);
    return;
  }
  if (SETTINGS_VIEWS.includes(target.view)) return app.openSettings(target.section ?? target.view);
  const saved = savedPlannerTarget(target);
  if (saved) return openSaved(app, saved);
  if (target.view === 'ideas') return aiAction(app, 'ideas');
  if (target.view === 'vision') return contextEditor(app);
  if (target.view === 'calendar') return calendarEditor(app);
  if (target.view === 'review') return app.openReview();
  if (target.view === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(target.date ?? '')) state.day = target.date;
  const tab = VIEW_TABS[target.view];
  if (tab) {
    state.tab = tab;
    state.stack = [];
    app.render({reset: true});
  }
  if (target.complete != null) return completeFromNotch(app, target);
  if (target.view === 'meal') return openMealFromNotch(app, target);
  if (target.view === 'water' && target.drink) return drinkFromNotch(app);
  return undefined;
}
