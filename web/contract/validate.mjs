import snapshotSchema from './snapshot.schema.json' with {type: 'json'};
import commandSchema from './command.schema.json' with {type: 'json'};

const keywords = new Set(['$schema', 'title', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'maxItems', 'minItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'format', 'pattern', 'oneOf', 'anyOf', 'minProperties']);
function checkSchema(schema) {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error('Unsupported sync schema keyword');
  for (const child of Object.values(schema.properties ?? {})) checkSchema(child);
  if (schema.items) checkSchema(schema.items);
  for (const child of [...schema.oneOf ?? [], ...schema.anyOf ?? []]) checkSchema(child);
}
checkSchema(snapshotSchema);
checkSchema(commandSchema);
const dayValid = value => {
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
};
function instantValid(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[zZ]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  return !!match && dayValid(match[1]) && +match[2] < 24 && +match[3] < 60 && +match[4] < 60 && +(match[6] ?? 0) < 24 && +(match[7] ?? 0) < 60 && Number.isFinite(Date.parse(value));
}
function matches(schema, value) {
  if (schema.oneOf && schema.oneOf.filter(s => matches(s, value)).length !== 1) return false;
  if (schema.anyOf && !schema.anyOf.some(s => matches(s, value))) return false;
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  const type = schema.type;
  if (type === 'null' && value !== null || type === 'array' && !Array.isArray(value) || type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) return false;
  if (['string', 'boolean', 'number'].includes(type) && typeof value !== type || type === 'integer' && !Number.isInteger(value)) return false;
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (typeof value === 'string') {
    const length = [...value].length;
    if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity) || schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === 'date-time' && !instantValid(value)) return false;
    if (schema.pattern === '^\\d{4}-\\d{2}-\\d{2}$' && !dayValid(value)) return false;
  }
  if (Array.isArray(value)) {
    if (value.length > (schema.maxItems ?? Infinity) || value.length < (schema.minItems ?? 0)) return false;
    if (schema.items && !value.every(item => matches(schema.items, item))) return false;
  } else if (value && typeof value === 'object') {
    if ((schema.required ?? []).some(key => !Object.hasOwn(value, key))) return false;
    if (Object.keys(value).length < (schema.minProperties ?? 0)) return false;
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) { if (schema.additionalProperties === false) return false; }
      else if (!matches(schema.properties[key], value[key])) return false;
    }
  }
  return true;
}
export function validateSnapshot(value) {
  if (!matches(snapshotSchema, value)) throw new Error('Invalid planner snapshot');
  return value;
}
export function validateCommand(value) {
  if (!matches(commandSchema, value) || value.type === 'reschedule' && value.args.time !== null && value.args.day !== null) throw new Error('Invalid browser command');
  return value;
}
