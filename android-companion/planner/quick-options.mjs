import {el, icon, button} from './dom.mjs';
import {duration} from './format.mjs';
import {repeatLabel, foldGroup, foldFor, markChips, chipRow, durationChooser, repeatChooser, alertChooser} from './task-fields.mjs';
import {inlineText, syncText} from './sheet-parts.mjs';

export function quickOptions(s, {body, group, changed, remember}) {
  const options = foldGroup(body);
  const durationChip = button('', null, 'assist-chip');
  durationChip.append(icon('timer'), el('span', 'chip-label'));
  const mustChip = button('', () => { s.must = !s.must; changed(); }, 'assist-chip must-chip');
  mustChip.append(icon('star'), el('span', 'chip-label', 'Must'));
  const repeatChip = button('', null, 'assist-chip');
  repeatChip.append(icon('repeat'), el('span', 'chip-label'));
  const moreChips = chipRow('quick-row');
  moreChips.append(durationChip, repeatChip, mustChip);
  const durationFold = foldFor(options, durationChip, inner => durationChooser(inner, {
    get: () => s.minutes,
    pick: minutes => { s.minutes = minutes; options.close(); changed(); },
  }));
  const repeatFold = foldFor(options, repeatChip, inner => repeatChooser(inner, {
    get: () => ({value: s.repeat, every: s.every}),
    pick: (value, every) => {
      Object.assign(s, {repeat: value, every});
      if (value !== 'after') options.close();
      changed();
    },
  }));
  const moreRow = button('', null, 'quick-details');
  moreRow.append(icon('tune'), el('span', 'chip-label', 'More options'), icon('expand_more', {cls: 'quick-details-open'}));
  const moreFold = foldFor(group, moreRow, inner => {
    inner.append(moreChips, durationFold.node, repeatFold.node);
    const notes = inlineText(inner, 'notes', 'Add details', s.notes, () => {});
    notes.addEventListener('input', () => { s.notes = notes.value; remember(); });
    const why = inlineText(inner, 'favorite', 'Why? (optional)', s.why, () => {});
    why.addEventListener('input', () => { s.why = why.value; remember(); });
    const alertRow = el('div', 'alert-choices');
    alertChooser(alertRow, {get: () => s.alert, pick: value => { s.alert = value; changed(); }});
    inner.append(alertRow);
    const refresh = () => {
      syncText(notes, s.notes);
      syncText(why, s.why);
      why.closest('.detail-row').hidden = !!s.blockId;
      alertRow.hidden = !s.time;
      markChips(alertRow, s.alert);
    };
    refresh();
    return refresh;
  });

  const paint = () => {
    durationChip.querySelector('.chip-label').textContent = s.minutes == null ? 'Estimate' : duration(s.minutes);
    durationChip.classList.toggle('on', s.minutes != null);
    mustChip.classList.toggle('on', s.must);
    mustChip.setAttribute('aria-pressed', String(s.must));
    mustChip.querySelector('.ms').classList.toggle('fill', s.must);
    const repeat = s.repeat && repeatLabel(s.repeat === 'after' ? {repeatAfterDays: s.every} : {recurrence: s.repeat});
    repeatChip.querySelector('.chip-label').textContent = repeat || 'Repeat';
    repeatChip.classList.toggle('on', !!s.repeat);
    repeatChip.setAttribute('aria-label', repeat ? 'Repeat: ' + repeat : 'Repeat');
    const set = [s.minutes != null && duration(s.minutes), repeat, s.must && 'Must',
      (s.notes || s.why) && 'Details', s.alert !== 'off' && 'Alert'].filter(Boolean).join(', ');
    moreRow.querySelector('.chip-label').textContent = set || 'More options';
    moreRow.setAttribute('aria-label', set ? 'More options: ' + set : 'More options');
    moreRow.classList.toggle('on', !!set);
    options.current?.refresh();
  };

  return {row: moreRow, node: moreFold.node, close: () => options.close(), paint};
}
