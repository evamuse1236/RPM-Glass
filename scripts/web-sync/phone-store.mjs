import {mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import kinds from '../../web/contract/records.json' with {type: 'json'};
import {isDeepStrictEqual} from 'node:util';

const readPath = (data, path) => path.reduce((value, field) => value?.[field], data);
function records(data, spec) {
  const result = new Map();
  for (const location of [spec, spec.alternate].filter(Boolean)) {
    const container = readPath(data, location.path);
    if (container === undefined) continue;
    if (location.shape === 'single') result.set(spec.key.constant, container);
    else if (location.shape === 'map') for (const [id, value] of Object.entries(container)) result.set(id, value);
    else {
      const counts = new Map();
      for (const value of container) {
        const filter = spec.filter;
        if (filter && (value?.[filter.field] ?? filter.default) !== filter.equals) continue;
        let raw = value;
        if (spec.key.indexBase !== undefined) {
          const n = counts.get(value) ?? spec.key.indexBase;
          counts.set(value, n + 1); raw = {instant: value, n};
        }
        result.set(spec.key.fields.map(field => raw[field]).join(spec.key.separator ?? ''), value);
      }
    }
  }
  return result;
}
const groupValue = (record, fields, aliases = {}) => fields.length
  ? Object.fromEntries(fields.filter(field => Object.hasOwn(record ?? {}, aliases[field] ?? field)).map(field => [field, record[aliases[field] ?? field]])) : record;
export function stampLocal(before, next, at) {
  next.syncSavedAt = at;
  next.sync ??= {};
  next.sync.stamps = structuredClone(before.sync?.stamps ?? {});
  for (const [kind, spec] of Object.entries(kinds)) {
    const previous = records(before, spec);
    for (const [id, value] of records(next, spec)) for (const [group, fields] of Object.entries(spec.groups)) {
      if (previous.has(id) && isDeepStrictEqual(groupValue(previous.get(id), fields, spec.fieldAliases), groupValue(value, fields, spec.fieldAliases))) continue;
      (next.sync.stamps[`${kind}:${id}`] ??= {})[group] = at;
    }
  }
}

export function filePhone(path) {
  const read = () => JSON.parse(readFileSync(path, 'utf8'));
  async function update(change) {
    const lock = path + '.lock', deadline = Date.now() + 15000;
    mkdirSync(dirname(path), {recursive: true});
    for (;;) {
      try { mkdirSync(lock); break; }
      catch (error) { if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error; await setTimeout(10); }
    }
    try {
      const state = read();
      change(state);
      writeFileSync(path + '.tmp', JSON.stringify(state, null, 1), {mode: 0o600});
      renameSync(path + '.tmp', path);
    } finally { rmdirSync(lock); }
  }
  return {
    load: async () => read().data,
    token: () => read().token,
    setToken: token => update(state => { state.token = token; }),
    save: (expected, next, {origin = 'local'} = {}) => update(state => {
      if (state.data.version !== expected || next.version !== expected + 1)
        throw Object.assign(new Error('Saved context changed. Reopen RPM before retrying.'), {code: 'VERSION_CONFLICT'});
      if (origin !== 'sync') stampLocal(state.data, next, new Date().toISOString());
      state.data = next;
    }),
  };
}
