import {saveReviewProgress} from './review-state.mjs';
import {MAX_FOCUS, icon, button} from './review-ui.mjs';

/** A checkbox row that puts a Result in this week's Results (a draft, saved quietly): Carry in step 1, Pick in step 4. */
export function focusCheck(api, blockId, title, cls = 'wr-check') {
  const on = api.ui.focus.includes(blockId);
  const box = button('', () => toggleFocus(api, blockId), cls + (on ? ' on' : ''));
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', String(on));
  box.dataset.key = 'focus:' + blockId;
  box.append(icon(on ? 'check_box' : 'check_box_outline_blank', on));
  return box;
}
function toggleFocus(api, blockId) {
  const {focus} = api.ui;
  setFocus(api, focus.includes(blockId) ? focus.filter(id => id !== blockId) : [...focus, blockId]);
}
/** This week's draft choice, at most five; saved quietly (it is a draft until Finish). */
export function setFocus(api, ids) {
  const {ui} = api;
  ui.focusHint = ids.length > MAX_FOCUS ? 'Five is the most for one week. Unpick one to swap it.' : '';
  ui.focus = [...new Set(ids)].slice(0, MAX_FOCUS);
  api.render();
  api.run(d => saveReviewProgress(d, api.week, {focusDraft: ui.focus}), null);
}
