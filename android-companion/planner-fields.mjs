/** Field checks shared by every planner op: each throws the words the user sees. */
import {capitalizeTitle} from '../cli/title.mjs';
export const text = (v, max = 2000) => {
  if (typeof v !== 'string' || v.length > max) throw new Error('Text is too long or invalid.');
  return v.trim();
};
export const title = v => {
  const s = text(v, 200);
  if (!s) throw new Error('Add a title.');
  return capitalizeTitle(s);
};
export const integer = (v, min, max) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error('Choose a valid number.');
  return v;
};
export const one = (rows, id) => {
  const r = rows.find(x => x.id === id);
  if (!r) throw new Error('This item no longer exists.');
  return r;
};
export const link = (rows, id) => (id == null || id === '' ? null : one(rows, id).id);
