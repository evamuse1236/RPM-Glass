import kinds from '../web/contract/records.json' with {type: 'json'};
import {groupsOf} from '../web/contract/records.mjs';
import {stable} from '../intent-v2/src/context.mjs';

export const equal = (a, b) => stable(a) === stable(b);
export const knownRecord = key => Object.hasOwn(kinds, key.slice(0, key.indexOf(':')));
const groups = key => knownRecord(key) ? groupsOf(key.slice(0, key.indexOf(':'))) : {};
const groupValue = (value, fields) => fields.length
  ? Object.fromEntries(fields.filter(field => value?.[field] !== undefined).map(field => [field, value[field]])) : value;

export function changedGroups(key, before, after) {
  return Object.entries(groups(key)).filter(([, fields]) => !equal(groupValue(before, fields), groupValue(after, fields))).map(([group]) => group);
}

export function copyGroups(key, target, source, names) {
  let value = structuredClone(target);
  for (const name of names) {
    const fields = groups(key)[name];
    if (!fields.length) value = structuredClone(source);
    else for (const field of fields) {
      if (source?.[field] !== undefined) value[field] = structuredClone(source[field]);
      else delete value[field];
    }
  }
  return value;
}
