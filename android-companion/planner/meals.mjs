/** The meal on Today and the meal sheet: the slot guessed from the time, the usual meals for it as one-tap chips, a
 * box to type one, then a Saved state with Jev's nutrition guess kept apart from the user's words. */
import {guessSlot, usualMeals, estimateText, clockText, SLOTS, SLOT_NAMES, SLOT_PLURALS} from '../body-state.mjs';
import {el, icon, button, iconButton} from './dom.mjs';
import {openSheet, closeSheet, field} from './sheet.mjs';
import {openMenu} from './menu.mjs';
import {notice} from './snackbar.mjs';
import {phraseNodes} from './today-row.mjs';
import {choiceChip, chipRow, markChips} from './task-fields.mjs';
import {openMealEditor} from './habit-editors.mjs';
import {openHabits} from './habits.mjs';

function estimateLine(estimate) {
  const line = el('div', 'estimate-line');
  line.hidden = !estimate;
  if (estimate?.status === 'ready') {
    const words = el('span');
    words.append(...phraseNodes(estimateText(estimate).split(' · ').map(text => ({text}))));
    line.append(icon('auto_awesome'), words);
  } else if (estimate?.status === 'failed') {
    line.append(icon('auto_awesome'), el('span', '', 'No estimate this time. Your meal is saved.'));
  } else if (estimate) {
    const bar = el('div', 'estimate-progress');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Guessing the nutrition');
    bar.append(el('i'));
    line.classList.add('pending');
    line.append(bar, el('span', '', 'Guessing the nutrition…'));
  }
  line.setAttribute('aria-live', 'polite');
  return line;
}

export function openMealSheet(app, body, {mealId = null, prefill = '', slot: wanted = null, motion = 'forward'} = {}) {
  const editing = mealId ? body.meal(mealId) : null;
  const {body: content, actions, header} = openSheet(app, editing ? 'Edit meal' : 'Log a meal', {variant: 'meal', motion});
  const plan = body.mealTimes();
  const offered = SLOTS.filter(value => value === editing?.slot || plan.find(p => p.slot === value)?.on !== false);
  const slotName = value => plan.find(p => p.slot === value)?.name ?? SLOT_NAMES[value];
  let typed = prefill || editing?.name || '';
  if (!editing) {
    header.querySelector('.sheet-close').before(iconButton('tune', 'Edit meals', () => {
      const back = () => openMealSheet(app, body, {slot, prefill: typed, motion: 'back'});
      if (plan.some(p => p.slot === slot)) openMealEditor(app, body, slot, {back, backLabel: 'Back to Log a meal'});
      else openHabits(app, body);
    }));
  }
  if (editing) {
    const more = iconButton('more_vert', 'More options', () => openMenu(more, [
      {label: 'Delete meal', icon: 'delete', danger: true, onClick: () => body.deleteMeal(editing.id).then(() => {
        closeSheet(app);
        app.render();
        notice(app, 'Meal deleted', {undo: true});
      }, () => notice(app, "Couldn't delete. Try again."))},
    ]));
    header.querySelector('.sheet-close').before(more);
  }
  const now = body.now();
  const guessed = guessSlot(now);
  const firstOffered = [wanted, guessed].find(value => offered.includes(value)) ?? offered[0] ?? guessed;
  let slot = editing?.slot ?? firstOffered;

  function renderForm(text) {
    content.replaceChildren();
    actions.replaceChildren();
    const slots = chipRow('slot-chips');
    slots.setAttribute('role', 'group');
    slots.setAttribute('aria-label', 'Meal');
    for (const value of offered) slots.append(choiceChip(slotName(value), value, picked => { slot = picked; paintSlot(); }));
    markChips(slots, slot);
    const helper = el('p', 'body-helper tnum', `Guessed from the time · ${clockText(now)}`);
    const usualHead = el('h3', 'field-group-label');
    const usual = el('div', 'chip-row wrap usual-chips');
    const nothing = el('p', 'body-helper');
    const input = field(app, content, 'Or type what you ate', text);
    input.enterKeyHint = 'done';
    const error = el('p', 'sheet-error');
    error.setAttribute('role', 'alert');
    input.parentElement.before(slots, helper, usualHead, usual, nothing);
    content.append(error);
    if (!editing) content.append(button('See history', () => { closeSheet(app); app.openHistory(); }, 'text-btn body-history-link'));

    const save = async name => {
      const words = name.trim();
      if (!words) return;
      error.textContent = '';
      let saved;
      try {
        saved = await body.saveMeal(editing ? {...editing, name: words, slot, state: 'logged'} : {name: words, slot, at: now.toISOString()});
      } catch {
        error.textContent = "Couldn't save. Try again.";
        return;
      }
      app.render();
      renderSaved(saved, words);
    };
    function paintSlot() {
      helper.hidden = !!editing || slot !== guessed;
      const names = usualMeals(body.meals(), slot);
      usualHead.textContent = `Your usual ${SLOT_PLURALS[slot]}`;
      usualHead.hidden = !names.length;
      usual.replaceChildren(...names.map(name => {
        const chip = button('', () => save(name), 'assist-chip usual-chip');
        chip.append(el('span', 'chip-label', name));
        chip.setAttribute('aria-label', `Save ${name} as ${slotName(slot).toLowerCase()}`);
        return chip;
      }));
      usual.hidden = !names.length;
      nothing.textContent = `Nothing usual for ${slotName(slot).toLowerCase()} yet. Type it once and it'll be here next time.`;
      nothing.hidden = !!names.length;
    }
    const submit = button('Save', () => save(input.value), 'filled-btn');
    const sync = () => { submit.disabled = !input.value.trim(); };
    input.addEventListener('input', () => { typed = input.value; sync(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); save(input.value); } });
    actions.append(submit);
    sync();
    paintSlot();
    app.sheetRefresh = paintSlot;
  }

  function renderSaved(meal, words) {
    content.replaceChildren();
    const tile = el('div', 'saved-tile');
    const mark = el('span', 'saved-mark');
    mark.append(icon('check'));
    const copy = el('div', 'saved-copy');
    copy.append(el('p', 'saved-title', 'Saved'),
      el('p', 'saved-line tnum', `${meal.name} · ${SLOT_NAMES[meal.slot]} · ${clockText(meal.at)}`));
    tile.append(mark, copy);
    let line = estimateLine(body.meal(meal.id)?.estimate);
    content.append(tile, line);
    const paintEstimate = () => {
      if (!line.isConnected) return;
      const next = estimateLine(body.meal(meal.id)?.estimate);
      line.replaceWith(next);
      line = next;
    };
    if (!body.meal(meal.id)?.estimate) body.estimate(meal.id).then(paintEstimate, paintEstimate);
    actions.replaceChildren(
      button('Undo', async () => {
        try {
          await app.api.commit({type: 'undo'});
        } catch {
          notice(app, "Couldn't undo. Try again.");
          return;
        }
        app.render();
        renderForm(words);
      }, 'text-btn'),
      button('Done', () => closeSheet(app), 'filled-btn'),
    );
    app.sheetRefresh = paintEstimate;
  }

  renderForm(typed);
}
