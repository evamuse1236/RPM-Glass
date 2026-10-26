import {DESTINATIONS} from '../../android-companion/planner/shell.mjs';
import {button, el, icon, iconButton} from '../../android-companion/planner/dom.mjs';

function entry(glyph, label, onClick, cls = 'side-item') {
  const node = button('', onClick, cls);
  node.append(icon(glyph), el('span', 'side-label', label));
  return node;
}

export function activeEntry(ui) {
  const kind = ui.current()?.kind;
  return kind === 'search' ? 'search' : ui.tab();
}

export function mountSidebar(nav, planner, ui) {
  const items = new Map(DESTINATIONS.map(([tab, glyph, label]) => [tab, entry(glyph, label, () => ui.goTab(tab))]));
  const inbox = entry('inbox', 'Inbox', () => ui.inbox());
  const count = el('span', 'side-count tnum');
  inbox.append(count);
  const top = el('div', 'side-top');
  top.append(entry('add', 'Add task', () => ui.add(), 'side-add'), iconButton('mic', 'Capture', () => ui.capture(), {cls: 'side-capture'}));
  const tabs = el('div', 'side-group');
  tabs.append(...DESTINATIONS.map(([tab]) => items.get(tab)), inbox);
  nav.replaceChildren(top, tabs);
  const sync = () => {
    const active = activeEntry(ui);
    for (const [key, node] of items) {
      if (key === active) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
      node.querySelector('.ms').classList.toggle('fill', key === active);
    }
  };
  new MutationObserver(sync).observe(planner, {attributes: true, attributeFilter: ['data-view', 'data-detail']});
  sync();
  nav.hidden = false;
  return {setInbox: n => { count.textContent = n ? String(n) : ''; }};
}
