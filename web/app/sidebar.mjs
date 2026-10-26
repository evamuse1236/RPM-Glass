import {DESTINATIONS} from '../../android-companion/planner/shell.mjs';
import {button, el, icon} from '../../android-companion/planner/dom.mjs';

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
  items.set('inbox', entry('inbox', 'Inbox', () => ui.inbox()));
  items.set('search', entry('search', 'Search', () => ui.openSearch()));
  items.set('capture', entry('mic', 'Capture', () => ui.capture()));
  const add = entry('add', 'Add task', () => ui.add(), 'side-add');
  const tabs = el('div', 'side-group');
  tabs.append(...DESTINATIONS.map(([tab]) => items.get(tab)));
  const tools = el('div', 'side-group');
  tools.append(items.get('inbox'), items.get('search'), items.get('capture'));
  nav.replaceChildren(add, tabs, tools);
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
}
