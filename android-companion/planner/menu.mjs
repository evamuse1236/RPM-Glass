/** Material 3 dropdown menu anchored to the button that opened it. */
import {el, button, icon} from './dom.mjs';

let current = null;

export function closeMenu() {
  if (!current) return false;
  const {scrim, menu, anchor} = current;
  current = null;
  scrim.remove();
  menu.remove();
  anchor?.focus?.({preventScroll: true});
  return true;
}

export const isMenuOpen = () => !!current;

function place(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - width - 8, rect.right - width));
  const below = rect.bottom + 4;
  const top = below + height > innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
  menu.style.setProperty('--menu-left', left + 'px');
  menu.style.setProperty('--menu-top', top + 'px');
}

/** items: [{label, icon, onClick, danger, divider}] */
export function openMenu(anchor, items, label = 'More options') {
  closeMenu();
  const scrim = button('', closeMenu, 'menu-scrim');
  scrim.setAttribute('aria-label', 'Close menu');
  const menu = el('div', 'menu');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  for (const item of items) {
    if (item.divider) {
      menu.append(el('hr', 'menu-divider'));
      continue;
    }
    const row = button('', () => {
      closeMenu();
      item.onClick();
    }, 'menu-item' + (item.danger ? ' danger' : ''));
    row.setAttribute('role', 'menuitem');
    if (item.icon) row.append(icon(item.icon));
    row.append(el('span', '', item.label));
    menu.append(row);
  }
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  });
  document.body.append(scrim, menu);
  current = {scrim, menu, anchor};
  place(menu, anchor);
  menu.querySelector('button')?.focus({preventScroll: true});
}
