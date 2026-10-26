import {el, iconButton} from '../../android-companion/planner/dom.mjs';
import {rowMenu} from '../../android-companion/planner/row-gestures.mjs';

export const FINE = '(hover: hover) and (pointer: fine)';
export const TOOLS = ['done', 'schedule', 'move'];
const OPENER = '.task-main, .spine-open';

export function actionRow(node) {
  for (let n = node; n; n = n.parentNode) if (n.rowActions) return n;
  return null;
}

export const rowOpener = row => row.querySelector(OPENER) ?? row;

const pointAt = (x, y) => ({top: y, bottom: y, left: x, right: x, width: 0, height: 0});

export function mountRowTools(root = document) {
  const tools = el('div', 'row-tools');
  tools.setAttribute('role', 'toolbar');
  tools.addEventListener('pointerdown', event => event.stopPropagation());
  let row = null;
  const place = node => {
    const next = actionRow(node);
    if (!next || (next === row && tools.parentNode === next)) return;
    row = next;
    tools.setAttribute('aria-label', next.rowTitle);
    tools.replaceChildren(...TOOLS.map(id => {
      const action = next.rowActions.find(item => item.id === id);
      return iconButton(action.icon, action.label, event => {
        event.stopPropagation();
        action.run();
      });
    }));
    next.append(tools);
  };
  root.addEventListener('pointerover', event => { if (event.pointerType === 'mouse') place(event.target); });
  root.addEventListener('focusin', event => place(event.target));
  root.addEventListener('contextmenu', event => {
    const target = actionRow(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const opener = rowOpener(target);
    rowMenu(target, {getBoundingClientRect: () => pointAt(event.clientX, event.clientY), focus: options => opener.focus(options)});
  }, true);
  return tools;
}
