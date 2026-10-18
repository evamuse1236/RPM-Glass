/** The task sheet's Block: the Part of card when there is one (its pencil unfolds the list), else a row with the suggested Block one tap away. */
import {el, icon, button, iconButton} from './dom.mjs';
import {reducedMotion, EASE, DURATION} from '../surface-motion.mjs';
import {fieldRow, blockChooser, recentBlock, rememberBlock} from './task-fields.mjs';
import {partOf, suggestBlock} from './sheet-parts.mjs';

export function blockField(app, group, {id, live, save}) {
  const pickBlock = (blockId, blockTitle) => {
    group.close();
    rememberBlock(blockId);
    save({type: 'moveTask', id, blockId}, blockId ? 'Moved to ' + blockTitle : 'Moved to No block');
  };
  const blockRow = fieldRow(group, {symbol: 'stacks', label: 'Block', cls: 'block-field', build: inner => blockChooser(inner, {
    blocks: () => app.activeBlocks(),
    get: () => live()?.blockId ?? null,
    pick: pickBlock,
    recent: recentBlock(),
    suggested: suggestBlock(app, live(), live()?.blockId)?.id ?? null,
  })});
  const panelSlot = el('div', 'part-of-slot');
  const suggestSlot = el('div', 'suggest-slot');
  const face = el('div', 'block-face');
  blockRow.wrap.insertBefore(face, blockRow.node);
  face.append(blockRow.head, panelSlot, suggestSlot);
  let panelKey = null;
  let faceMotion = [];
  // Choosing a Block is one container transform: the face's box grows from the row's height to the card's (250ms
  // emphasized) while the content fades through (the row's words out in 90ms, then the card's in over 160ms).
  const paint = t => {
    const context = app.context(t);
    const key = context.block ? `${context.block.id}|${context.block.title}|${context.block.purpose}` : '';
    const animate = panelKey !== null && key !== panelKey && !reducedMotion() && face.isConnected
      && !!face.getClientRects().length;
    const from = animate ? face.getBoundingClientRect().height : 0;
    let ghost = null;
    if (animate) {
      ghost = el('div', 'block-face-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      for (const part of face.children) if (!part.classList.contains('block-face-ghost')) ghost.append(part.cloneNode(true));
    }
    blockRow.head.hidden = !!context.block && !blockRow.isOpen;
    blockRow.set(context.block ? context.block.title : 'No block · Choose a Block', {aria: context.block ? context.block.title : 'No block'});
    if (key !== panelKey) {
      panelKey = key;
      panelSlot.replaceChildren();
      if (context.block) {
        const change = iconButton('edit', 'Change Block', () => group.toggle(blockRow), {cls: 'part-change'});
        panelSlot.append(partOf(app, t), change);
      }
    }
    const suggested = context.block ? null : suggestBlock(app, t);
    const suggestKey = suggested?.id ?? '';
    if (suggestSlot.dataset.key !== suggestKey) {
      suggestSlot.dataset.key = suggestKey;
      suggestSlot.replaceChildren();
      if (suggested) {
        const chip = button('', () => pickBlock(suggested.id, suggested.title), 'assist-chip suggest-chip');
        chip.append(icon('auto_awesome'), el('span', 'chip-label', suggested.title));
        chip.setAttribute('aria-label', `Suggested Block ${suggested.title}`);
        suggestSlot.append(chip);
      }
    }
    if (!animate) return;
    for (const motion of faceMotion) motion.cancel();
    face.querySelectorAll(':scope > .block-face-ghost').forEach(n => n.remove());
    const to = face.getBoundingClientRect().height;
    face.append(ghost);
    face.classList.add('resizing');
    face.dataset.toHeight = String(to);
    const motions = [
      face.animate([{height: from + 'px'}, {height: to + 'px'}], {duration: DURATION.medium1, easing: EASE.emphasized}),
      ghost.animate([{opacity: 1}, {opacity: 0}], {duration: 90, easing: EASE.standardAccelerate, fill: 'forwards'}),
    ];
    const card = panelSlot.querySelector('.part-of');
    const fresh = card ? [...card.children, panelSlot.querySelector('.part-change')]
      : [blockRow.head, suggestSlot].filter(n => !n.hidden && n.getClientRects().length);
    for (const part of fresh.filter(Boolean)) {
      motions.push(part.animate([{opacity: 0}, {opacity: 1}],
        {duration: 160, delay: 90, easing: EASE.standardDecelerate, fill: 'backwards'}));
    }
    if (card) {
      const top = card.getBoundingClientRect().top - face.getBoundingClientRect().top;
      const hidden = Math.max(0, card.offsetHeight - Math.max(0, from - top));
      motions.push(card.animate([{clipPath: `inset(0 0 ${hidden}px 0 round 20px)`}, {clipPath: 'inset(0 0 0 0 round 20px)'}],
        {duration: DURATION.medium1, easing: EASE.emphasized}));
    }
    faceMotion = motions;
    const end = () => {
      if (faceMotion !== motions) return;
      ghost.remove();
      face.classList.remove('resizing');
      delete face.dataset.toHeight;
    };
    Promise.all(motions.map(m => m.finished)).then(end, end);
  };
  return {wrap: blockRow.wrap, row: blockRow, paint};
}
