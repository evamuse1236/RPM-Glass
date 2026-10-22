import snapshotSchema from '../web/contract/snapshot.schema.json' with {type: 'json'};
import {localDay} from './planner-state.mjs';
import {bodyOf} from './body-store.mjs';
import {receiptLines} from './capture-receipt.mjs';
import {validateSnapshot} from '../web/contract/validate.mjs';

const string = value => typeof value === 'string' ? value : '';
const nullable = value => value ?? null;
const receipt = (data, draft) => receiptLines(data, draft).map(line => ({text: [line.verb, line.title, line.was && `${line.was} to ${line.when}`, !line.was && line.when, line.where, line.alert].filter(Boolean).join(' · ')}));
function task(row) {
  return {id: row.id, title: string(row.title ?? row.raw), raw: string(row.raw), notes: string(row.notes), purpose: string(row.purpose),
    planned: nullable(row.planned), plannedDate: nullable(row.plannedDate), minutes: nullable(row.minutes), alert: nullable(row.alertIntent?.type ?? row.alert), blockId: nullable(row.blockId),
    must: !!row.must, priority: nullable(row.priority), done: !!row.done, archived: !!row.archived, archiveDisposition: nullable(row.archiveDisposition), recurrence: nullable(row.recurrence),
    repeatAfterDays: nullable(row.repeatAfterDays), completedAt: nullable(row.completedAt), completedOccurrences: [...row.completedOccurrences ?? []]};
}
function entity(row) {
  const result = {id: row.id, title: string(row.title), purpose: string(row.purpose), notes: string(row.notes), archived: !!row.archived};
  for (const key of ['projectId', 'goalId', 'areaId', 'year', 'horizon', 'period', 'rating', 'colorIndex']) result[key] = nullable(row[key]);
  return result;
}
function draftSummary(data, draft) {
  return {id: draft.id, status: string(draft.status), title: string(draft.title ?? draft.proposed?.[0]?.title), reply: string(draft.reply), receipt: receipt(data, draft),
    taskIds: [...new Set([...(draft.receipt?.entryIds ?? []), ...(draft.proposed ?? []).flatMap(p => p.taskIds ?? [])])].filter(id => Number.isInteger(id) && id > 0)};
}
// The schema is the deep allowlist for the store-shaped copy. Maps retain identifiers only;
// each value is projected through its own record schema. Invalid declared values still fail validation.
function copy(schema, value) {
  if (schema.$ref) return copy(snapshotSchema.$defs[schema.$ref.slice('#/$defs/'.length)], value);
  if (schema.anyOf) return copy(schema.anyOf.find(s => value === null ? s.type === 'null' : s.type !== 'null'), value);
  if (value == null) return value;
  if (schema.type === 'array') return value.map(item => copy(schema.items, item));
  if (schema.type !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(schema.properties ?? {})) if (value[key] !== undefined) result[key] = copy(child, value[key]);
  if (typeof schema.additionalProperties === 'object') for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(result, key, {value: copy(schema.additionalProperties, item), enumerable: true});
  }
  return result;
}

/** Only the declared browser fields cross this boundary. Never spread store objects. */
export function buildSnapshot(data) {
  const p = data.planner ?? {}, body = bodyOf(data), state = data.intentV2 ?? {};
  const snapshot = {schemaVersion: 2, revision: data.version, savedAt: data.syncSavedAt ?? '1970-01-01T00:00:00.000Z', tasks: (data.entries ?? []).filter(row => (row.kind ?? 'plan') === 'plan').map(task)};
  for (const key of ['blocks', 'projects', 'areas', 'goals']) snapshot[key] = (p[key] ?? []).map(entity);
  snapshot.drafts = [...p.drafts ?? [], ...Object.values(state.drafts ?? {})].map(draft => draftSummary(data, draft));
  snapshot.captures = Object.values(state.captures ?? {}).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? ''))).slice(-50).map(capture => ({
    id: capture.messageId, text: string(capture.raw), status: string(capture.status), createdAt: nullable(capture.at), receipt: receipt(data, state.drafts?.[capture.draftId])}));
  const settings = {};
  for (const key of ['goal', 'intervalMinutes', 'from', 'until', 'glassMl', 'snoozeMinutes', 'reminders']) settings[key] = body.water.settings[key];
  snapshot.body = {water: {settings, glasses: [...body.water.glasses], snoozedUntil: body.water.snoozedUntil},
    meals: body.meals.map(m => ({id: m.id, name: m.name, slot: m.slot, at: m.at})),
    mealPlan: {slots: body.mealPlan.slots.map(s => ({slot: s.slot, at: s.at, on: s.on, name: string(s.name)}))},
    routines: body.routines.map(r => ({id: r.id, name: r.name, start: r.start, end: r.end, days: [...r.days], steps: r.steps.map(s => ({id: s.id, title: s.title})), archived: !!r.archived})),
    runs: body.runs.map(r => ({routineId: r.routineId, day: r.day, marks: Object.entries(r.marks ?? {}).map(([stepId, m]) => ({stepId, state: m.state, at: m.at})), skippedDay: !!r.skippedDay}))};
  snapshot.entries = (data.entries ?? []).filter(row => (row.kind ?? 'plan') === 'plan').map(row => {
    const {alert, ...summary} = task(row);
    const reviewActivityDays = [...new Set((row.revisions ?? []).filter(r => r.snapshot?.done === true && Number.isFinite(Date.parse(r.at))).map(r => localDay(r.at)))];
    return copy(snapshotSchema.$defs.entry, {...row, ...summary, kind: 'plan', alertIntent: {type: alert, ...row.alertIntent}, completions: row.completions ?? [], reviewActivityDays});
  });
  const storeBody = {...body, schema: 1, water: snapshot.body.water, routines: body.routines.map(r => ({...r, archived: !!r.archived})),
    meals: body.meals, runs: body.runs.map(r => ({...r, skippedDay: !!r.skippedDay})), mealPlan: snapshot.body.mealPlan};
  snapshot.planner = copy(snapshotSchema.properties.planner, {
    schema: 1, reviewVersion: 1, uxVersion: 2,
    ...Object.fromEntries(['blocks', 'projects', 'areas', 'goals'].map(key => [key, (p[key] ?? []).map(row => ({...entity(row), ...row}))])),
    context: {vision: '', goals: '', coreValues: '', approved: false, ...p.context},
    weeks: Object.fromEntries(Object.entries(p.weeks ?? {}).map(([week, record]) => [week, {focus: [], verdicts: {}, ...record}])),
    reviews: p.reviews ?? {}, body: storeBody, drafts: snapshot.drafts, events: [],
  });
  return validateSnapshot(snapshot);
}
