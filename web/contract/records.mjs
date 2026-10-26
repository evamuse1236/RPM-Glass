import kinds from './records.json' with {type: 'json'};
import schema from './snapshot.schema.json' with {type: 'json'};
import {copy, projectSnapshot} from '../../android-companion/web-sync-snapshot.mjs';
import {freshPlanner} from '../../android-companion/planner-state.mjs';

export const groupsOf = kind => structuredClone(kinds[kind].groups);
const read = (root, path) => path.reduce((value, key) => value?.[key], root);
const kindOf = key => key.slice(0, key.indexOf(':'));
const rawKey = key => key.slice(key.indexOf(':') + 1);

export function recordKey(kind, raw) {
  const rule = kinds[kind].key;
  const id = rule.constant ?? (typeof raw !== 'object' ? raw : rule.fields.map(field => raw[field]).join(rule.separator ?? ''));
  return `${kind}:${id}`;
}

export function projectRecords(store) {
  const snapshot = projectSnapshot(store), publicStore = {entries: snapshot.entries, planner: snapshot.planner};
  const records = new Map();
  for (const [kind, spec] of Object.entries(kinds)) {
    const value = kind === 'capture' ? Object.fromEntries(snapshot.captures.map(c => [c.id, c])) : read(publicStore, spec.path);
    if (value === undefined) continue;
    if (spec.shape === 'single') records.set(recordKey(kind), structuredClone(value));
    else if (spec.shape === 'map') for (const [id, item] of Object.entries(value)) records.set(recordKey(kind, id), structuredClone(item));
    else {
      const counts = new Map();
      for (const item of value) {
        const n = counts.get(item) ?? 0;
        counts.set(item, n + 1);
        const raw = kind === 'glass' ? {instant: item, n} : item;
        records.set(recordKey(kind, raw), structuredClone(item));
      }
    }
  }
  return records;
}

function location(store, spec) {
  let parent = store;
  for (const field of spec.path.slice(0, -1)) parent = parent[field] ??= {};
  return [parent, spec.path.at(-1)];
}

function retainLocal(shape, old, value) {
  if (shape.$ref) return retainLocal(schema.$defs[shape.$ref.slice('#/$defs/'.length)], old, value);
  if (shape.anyOf) return retainLocal(shape.anyOf.find(s => value === null ? s.type === 'null' : s.type !== 'null'), old, value);
  if (value === null || shape.type !== 'object') return value;
  const next = {...old};
  for (const [field, child] of Object.entries(shape.properties ?? {})) {
    if (Object.hasOwn(value, field)) next[field] = retainLocal(child, old?.[field], value[field]);
    else delete next[field];
  }
  if (typeof shape.additionalProperties === 'object') return value;
  return next;
}

export function applyRecord(store, key, value) {
  const kind = kindOf(key), id = rawKey(key);
  let spec = kinds[kind];
  if (kind === 'draft' && Object.hasOwn(store.intentV2?.drafts ?? {}, id)) spec = {...spec, ...spec.alternate};
  if (kind === 'draft' && value === null && spec.shape === 'map') {
    const [primary, list] = location(store, kinds[kind]);
    primary[list] = (primary[list] ?? []).filter(item => recordKey(kind, item) !== key);
  }
  const [parent, field] = location(store, spec);
  let container = parent[field], old;
  if (kind === 'glass') {
    container = parent[field] ??= [];
    const split = id.lastIndexOf('#'), instant = id.slice(0, split), n = Number(id.slice(split + 1));
    const index = container.map((item, index) => item === instant ? index : -1).filter(index => index >= 0)[n];
    if (value === null) { if (index !== undefined) container.splice(index, 1); }
    else if (index === undefined) container.push(value);
    else container[index] = value;
    return;
  }
  if (spec.shape === 'list') {
    container = parent[field] ??= [];
    old = container.find(item => recordKey(kind, item) === key && (kind !== 'task' || (item.kind ?? 'plan') === 'plan'));
  } else old = spec.shape === 'map' ? Object.hasOwn(container ?? {}, id) ? container[id] : undefined : container;
  if (value === null) {
    if (spec.shape === 'list') parent[field] = container.filter(item => item !== old);
    else if (spec.shape === 'map') delete container?.[id];
    else delete parent[field];
    return;
  }
  const recordSchema = read(schema, spec.schema), projected = copy(recordSchema, value);
  const next = retainLocal(recordSchema, old, projected);
  if (kind === 'draft' && old?.receipt && !Array.isArray(old.receipt)) next.receipt = old.receipt;
  if (kind === 'task') {
    next.revisions ??= [];
    store.sync ??= {};
    store.sync.remoteActivity ??= {};
    store.sync.remoteActivity[id] = [...projected.reviewActivityDays ?? []];
    delete next.reviewActivityDays;
  }
  if (kind === 'capture') {
    for (const [publicField, localField] of Object.entries(spec.fieldAliases)) {
      if (Object.hasOwn(projected, publicField)) next[localField] = projected[publicField];
      else delete next[localField];
      delete next[publicField];
    }
  }
  if (spec.shape === 'single') parent[field] = next;
  else if (spec.shape === 'map') Object.defineProperty(parent[field] ??= {}, id, {value: next, enumerable: true, writable: true, configurable: true});
  else if (old) container[container.indexOf(old)] = next;
  else {
    container.push(next);
    if (spec.order) container.sort((a, b) => {
      for (const field of spec.order) {
        const left = a[field] ?? '', right = b[field] ?? '';
        if (left !== right) return left < right ? -1 : 1;
      }
      return 0;
    });
  }
}

export function storeFromRecords(map) {
  const store = {entries: [], planner: freshPlanner()};
  const entries = [...map];
  for (const [key, value] of entries.filter(([key]) => kindOf(key) !== 'glass')) applyRecord(store, key, value);
  for (const [key, value] of entries.filter(([key]) => kindOf(key) === 'glass').sort(([a], [b]) => {
    const instantA = a.slice(0, a.lastIndexOf('#')), instantB = b.slice(0, b.lastIndexOf('#'));
    return instantA < instantB ? -1 : instantA > instantB ? 1 : Number(a.slice(a.lastIndexOf('#') + 1)) - Number(b.slice(b.lastIndexOf('#') + 1));
  })) applyRecord(store, key, value);
  return store;
}

export function repairLinks(store, isDeleted) {
  const repairs = [];
  const repair = (key, group, before) => repairs.push({key, group, before: structuredClone(before)});
  for (const [key, value] of projectRecords(store)) {
    const kind = kindOf(key), link = {task: ['blockId', 'block', 'order'], block: ['projectId', 'project', 'projectId'],
      project: ['goalId', 'goal', 'goalId'], goal: ['areaId', 'area', 'areaId']}[kind];
    if (link && value[link[0]] && isDeleted(recordKey(link[1], value[link[0]]))) {
      repair(key, link[2], Object.fromEntries(groupsOf(kind)[link[2]].filter(field => Object.hasOwn(value, field)).map(field => [field, value[field]])));
      value[link[0]] = null;
      applyRecord(store, key, value);
    }
    if (kind === 'week') {
      const focus = value.focus.filter(id => !isDeleted(recordKey('block', id)));
      if (focus.length !== value.focus.length) { repair(key, 'focus', {focus: value.focus}); value.focus = focus; }
      const verdicts = Object.fromEntries(Object.entries(value.verdicts).filter(([id]) => !isDeleted(recordKey('block', id))));
      if (Object.keys(verdicts).length !== Object.keys(value.verdicts).length) { repair(key, 'verdicts', {verdicts: value.verdicts}); value.verdicts = verdicts; }
      applyRecord(store, key, value);
    }
    if (kind === 'run' && isDeleted(recordKey('routine', value.routineId))) {
      repair(key, 'record', value);
      applyRecord(store, key, null);
    }
  }
  return repairs;
}
