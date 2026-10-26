import kinds from './records.json' with {type: 'json'};

const equal = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a).filter(key => a[key] !== undefined), others = Object.keys(b).filter(key => b[key] !== undefined);
  return keys.length === others.length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
const groupValue = (value, fields) => fields.length ? Object.fromEntries(fields.filter(field => value?.[field] !== undefined).map(field => [field, value[field]])) : value;
function putGroup(value, fields, group) {
  if (!fields.length) return structuredClone(group);
  for (const field of fields) {
    if (Object.hasOwn(group, field)) value[field] = structuredClone(group[field]);
    else delete value[field];
  }
  return value;
}

export function mergeChange(row, change, now) {
  now = new Date(now).toISOString();
  const clamp = stamps => Object.fromEntries(Object.entries(stamps ?? {}).map(([group, at]) => [group, new Date(Math.min(Date.parse(at), Date.parse(now))).toISOString()]));
  change = {...change, stamps: clamp(change.stamps)};
  if (row) row = {...row, stamps: clamp(row.stamps)};
  if (!row || row.rev === change.baseRev) return {value: structuredClone(change.value), stamps: {...(row?.value === null ? {} : row?.stamps), ...change.stamps}, conflicts: []};
  if (row.value === null) return {value: null, stamps: structuredClone(row.stamps), conflicts: change.value === null ? [] : [
    {key: change.key, group: 'record', kept: null, lost: structuredClone(change.value), lostFrom: 'phone', at: now},
  ]};
  if (change.value === null) return {value: null, stamps: {...row.stamps, ...change.stamps}, conflicts: [
    {key: change.key, group: 'record', kept: null, lost: structuredClone(row.value), lostFrom: 'server', at: now},
  ]};
  const spec = kinds[change.key.slice(0, change.key.indexOf(':'))], base = change.baseRev === null ? null : change.base;
  let value = structuredClone(row.value);
  const stamps = structuredClone(row.stamps), conflicts = [], notes = [];
  for (const [group, fields] of Object.entries(spec.groups)) {
    const setFields = fields.filter(field => spec.setFields.includes(field));
    const keyedFields = fields.filter(field => Object.hasOwn(spec.keyedListFields, field));
    const atomicFields = fields.filter(field => !setFields.includes(field) && !keyedFields.includes(field));
    for (const field of setFields) {
      if (base?.[field] === undefined && change.value[field] === undefined && row.value[field] === undefined) continue;
      const beforeSet = new Set(base?.[field] ?? []), phoneSet = new Set(change.value[field] ?? []), serverSet = new Set(row.value[field] ?? []);
      value[field] = [...new Set([...beforeSet, ...phoneSet, ...serverSet])].filter(item => phoneSet.has(item) === beforeSet.has(item) ? serverSet.has(item) : phoneSet.has(item)).sort();
      if (!equal(value[field], row.value[field]) && change.stamps[group] !== undefined) stamps[group] = [stamps[group], change.stamps[group]].filter(Boolean).sort().at(-1);
    }
    for (const field of keyedFields) {
      if (base?.[field] === undefined && change.value[field] === undefined && row.value[field] === undefined) continue;
      const keyField = spec.keyedListFields[field], asMap = items => Array.isArray(items) ? new Map(items.map(item => [item[keyField], item])) : new Map(Object.entries(items ?? {}));
      const phone = asMap(change.value[field]), server = asMap(row.value[field]), original = asMap(base?.[field]), merged = new Map();
      const array = keyField !== 'step';
      const wrap = (id, item) => ({[field]: array ? item === undefined ? [] : [item] : item === undefined ? {} : {[id]: item}});
      for (const id of [...new Set([...original.keys(), ...phone.keys(), ...server.keys()])].sort()) {
        const ours = phone.get(id), theirs = server.get(id), before = original.get(id);
        let picked = theirs;
        if (!equal(ours, before)) {
          if (equal(theirs, before) || equal(ours, theirs)) picked = ours;
          else {
            const phoneWins = (change.stamps[group] ?? '') > (row.stamps[group] ?? '');
            picked = phoneWins ? ours : theirs;
            conflicts.push({key: change.key, group, kept: structuredClone(wrap(id, picked)), lost: structuredClone(wrap(id, phoneWins ? theirs : ours)), lostFrom: phoneWins ? 'server' : 'phone', at: now});
          }
        }
        if (picked !== undefined) merged.set(id, structuredClone(picked));
      }
      value[field] = array ? [...merged.values()] : Object.fromEntries(merged);
      if (!equal(value[field], row.value[field]) && change.stamps[group] !== undefined) stamps[group] = [stamps[group], change.stamps[group]].filter(Boolean).sort().at(-1);
    }
    if (fields.length && !atomicFields.length) continue;
    const ours = groupValue(change.value, atomicFields), theirs = groupValue(row.value, atomicFields), before = groupValue(base, atomicFields);
    if (equal(ours, before)) continue;
    if (equal(theirs, before) || equal(ours, theirs)) {
      value = putGroup(value, atomicFields, ours);
      if (change.stamps[group] !== undefined) stamps[group] = equal(ours, theirs) && stamps[group] > change.stamps[group] ? stamps[group] : change.stamps[group];
    } else {
      const phoneWins = (change.stamps[group] ?? '') > (row.stamps[group] ?? '');
      const kept = phoneWins ? ours : theirs, lost = phoneWins ? theirs : ours, lostFrom = phoneWins ? 'server' : 'phone';
      if (phoneWins) {
        value = putGroup(value, atomicFields, ours);
        if (change.stamps[group] !== undefined) stamps[group] = change.stamps[group];
      }
      if (group === 'order') continue;
      conflicts.push({key: change.key, group, kept: structuredClone(kept), lost: structuredClone(lost), lostFrom, at: now});
      if (spec.groups.notes) for (const field of fields) {
        if (!['title', 'raw', 'notes', 'purpose', 'leverage', 'evidence'].includes(field) || equal(kept[field], lost[field]) || typeof lost[field] !== 'string') continue;
        const text = input => String(input ?? '').replaceAll('\n', '\\n').replaceAll('\r', '\\r');
        const ending = ` Other version from your ${phoneWins ? 'website' : 'phone'}: '${text(lost[field])}'.`;
        if (field === 'notes' && (value.notes ?? '').split('\n').some(line => line.startsWith("Changed on two devices. Kept notes '") && line.endsWith(ending))) continue;
        notes.push(`Changed on two devices. Kept ${field} '${text(kept[field])}'.${ending}`);
      }
    }
  }
  for (const line of notes) if (!(value.notes ?? '').split('\n').includes(line)) {
    value.notes = [value.notes, line].filter(Boolean).join('\n');
    stamps.notes = now;
  }
  return {value, stamps, conflicts};
}
