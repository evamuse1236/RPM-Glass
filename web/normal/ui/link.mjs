/** Linking this browser with the phone: eight characters from Settings, Cloud, Link a web browser. */
import {h, icon, swap} from './dom.mjs';
import {userMessage} from '../../../android-companion/user-message.mjs';

const LENGTH = 8;

export function unlinkedView(go) {
  return h('div.unlinked', h('div.link-box', {style: {justifyItems: 'center', textAlign: 'center'}},
    h('div.empty-art', icon('link_off')),
    h('h1', "This browser isn't linked any more."),
    h('button.filled-btn', {type: 'button', onclick: () => go('link')}, 'Link again')));
}

export function linkView({link, done}) {
  const boxes = Array.from({length: LENGTH}, (_, i) => h('input', {type: 'text', inputMode: 'text', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, maxLength: 1, 'aria-label': `Character ${i + 1} of ${LENGTH}`}));
  const row = h('div.code-boxes', boxes);
  const button = h('button.filled-btn', {type: 'button'}, 'Link');
  const status = h('div', {role: 'status', 'aria-live': 'polite'});
  const bar = h('div.link-bar', {hidden: true});
  const code = () => boxes.map(b => b.value).join('').toUpperCase();
  const clean = text => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

  function fill(from, text) {
    const chars = clean(text).split('');
    for (let i = from; i < LENGTH && chars.length; i++) boxes[i].value = chars.shift();
    boxes[Math.min(LENGTH - 1, from + clean(text).length)].focus();
  }

  async function submit() {
    if (code().length < LENGTH) {
      swap(status, h('p.link-error', `Type all ${LENGTH} characters.`));
      return;
    }
    row.classList.remove('wrong');
    button.disabled = true;
    button.textContent = 'Linking…';
    bar.hidden = false;
    swap(status);
    try {
      await link(code());
      swap(status, h('p.link-ok', 'Linked to your phone'));
      setTimeout(done, 600);
    } catch (error) {
      row.classList.add('wrong');
      swap(status, h('p.link-error', userMessage(error)));
      button.disabled = false;
      button.textContent = 'Link';
    } finally {
      bar.hidden = true;
    }
  }

  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const value = clean(box.value);
      if (value.length > 1) return fill(i, value);
      box.value = value;
      if (value && i < LENGTH - 1) boxes[i + 1].focus();
    });
    box.addEventListener('paste', e => {
      e.preventDefault();
      fill(i, e.clipboardData.getData('text'));
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
      if (e.key === 'Enter') submit();
    });
  });
  button.addEventListener('click', submit);
  setTimeout(() => boxes[0].focus(), 0);

  return h('div.link-screen', h('div.link-box',
    h('h1', 'Link this browser with your phone'),
    h('p', 'On your phone, open RPM, then Settings, then Link a browser. Type the 8 characters it shows.'),
    row, bar, h('div', button), status));
}
