import {DESTINATIONS} from '../../android-companion/planner/shell.mjs';
import {button, el, icon, iconButton} from '../../android-companion/planner/dom.mjs';

function entry(glyph, label, onClick, cls = 'side-item') {
  const node = button('', onClick, cls);
  node.append(icon(glyph), el('span', 'side-label', label));
  return node;
}

export function activeEntry(ui) {
  const kind = ui.current()?.kind;
  return kind === 'search' || kind === 'settings' ? kind : ui.tab();
}

/** On a wide window the Inbox opens as a page in the main column (wide-pages.css), so while it shows it is the current
 * entry, and picking a tab leaves it. */
export function mountSidebar(nav, planner, ui, sheet = null) {
  const inboxPage = () => !!sheet && !sheet.hidden && sheet.getAttribute('data-inline') != null && sheet.classList.contains('sheet-inbox');
  const go = tab => { if (inboxPage()) ui.closeSheet(); ui.goTab(tab); };
  const items = new Map(DESTINATIONS.map(([tab, glyph, label]) => [tab, entry(glyph, label, () => go(tab))]));
  const inbox = entry('inbox', 'Inbox', () => ui.inbox());
  items.set('inbox', inbox);
  const count = el('span', 'side-count tnum');
  inbox.append(count);
  const top = el('div', 'side-top');
  top.append(entry('add', 'Add task', () => ui.add(), 'side-add'), iconButton('mic', 'Capture', () => ui.capture(), {cls: 'side-capture'}));
  const tabs = el('div', 'side-group');
  tabs.append(...items.values());
  nav.replaceChildren(top, tabs);
  const sync = () => {
    const active = inboxPage() ? 'inbox' : activeEntry(ui);
    for (const [key, node] of items) {
      if (key === active) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
      node.querySelector('.ms').classList.toggle('fill', key === active);
    }
  };
  if (sheet) new MutationObserver(sync).observe(sheet, {attributes: true, attributeFilter: ['hidden', 'class', 'data-inline']});
  new MutationObserver(sync).observe(planner, {attributes: true, attributeFilter: ['data-view', 'data-detail']});
  sync();
  nav.hidden = false;
  return {setInbox: n => { count.textContent = n ? String(n) : ''; }};
}
