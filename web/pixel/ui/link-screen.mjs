import {h, key} from './dom.mjs';
import {icon} from './icons.mjs';
import {KEYS} from '../sync/http.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';

const LENGTH = 8;
const clean = value => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH);

/** First run: eight plates fed by one hidden code field, so typing and pasting both work. */
export function linkScreen(ctx, {storage, onLinked}) {
  const input = h('input.code-input', {id: 'link-code', autocomplete: 'one-time-code', inputmode: 'text', autocapitalize: 'characters',
    spellcheck: false, maxlength: LENGTH, 'aria-describedby': 'link-help link-error', 'aria-label': 'Eight-character code from the phone'});
  const plates = h('div.code-plates', {'aria-hidden': 'true', onclick: () => input.focus()},
    Array.from({length: LENGTH}, () => h('span.code-plate')));
  const error = h('div.link-error', {id: 'link-error', role: 'alert'});
  const hero = h('span.link-hero', {'aria-hidden': 'true'}, icon('hero'));
  const submit = key('Link', null, {cls: 'filled', type: 'submit'});
  const room = h('section.room.link-room', {'aria-labelledby': 'link-title', dataset: {current: ''}},
    h('div.wall', {}, h('h1.sign', {id: 'link-title'}, 'Link this browser to your phone')),
    h('form.floor', {onsubmit: event => { event.preventDefault(); link(); }},
      h('p', {id: 'link-help'}, 'On the phone, open Settings, Cloud, Link a web browser, and read the 8-character code.'),
      h('label.code-field', {for: 'link-code'}, input, plates),
      error,
      h('div.link-actions', {}, submit, ctx.demo ? h('span.demo-label', {}, 'Demo: any 8 letters work') : null),
      ctx.demo ? null : h('details.sync-address', {},
        h('summary', {}, 'Sync address'),
        h('input.address', {type: 'url', value: storage.getItem(KEYS.base) ?? '', placeholder: 'https://your-deployment.convex.site',
          'aria-label': 'Sync address', onchange: event => storage.setItem(KEYS.base, event.target.value.trim())})),
      hero));

  function paint() {
    const code = clean(input.value);
    if (input.value !== code) input.value = code;
    [...plates.children].forEach((plate, i) => {
      plate.textContent = code[i] ?? '';
      plate.toggleAttribute('data-filled', !!code[i]);
      plate.toggleAttribute('data-caret', i === Math.min(code.length, LENGTH - 1) && document.activeElement === input);
    });
  }
  input.addEventListener('input', () => { error.replaceChildren(); delete room.dataset.error; paint(); });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);

  async function link() {
    const code = clean(input.value);
    if (code.length !== LENGTH) return input.focus();
    room.dataset.loading = '';
    submit.disabled = true;
    try {
      await ctx.store.link(code);
      room.dataset.linked = '';
      setTimeout(onLinked, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700);
    } catch (problem) {
      room.dataset.error = '';
      error.replaceChildren(h('p', {}, userMessage(problem)));
      input.focus();
    } finally {
      delete room.dataset.loading;
      submit.disabled = false;
    }
  }
  queueMicrotask(() => { input.focus(); paint(); });
  return h('main.link-screen', {}, room);
}
