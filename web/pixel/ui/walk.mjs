/** Walking the map: which room lies in a direction, and where the character stands. */

export const ROOMS = [
  {id: 'today', name: 'Today'},
  {id: 'capture', name: 'Capture desk'},
  {id: 'inbox', name: 'Inbox'},
  {id: 'week', name: 'Week'},
  {id: 'quests', name: 'Quests'},
];

const DIRECTIONS = {left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1]};

/**
 * The room to walk to from `from` in `direction`, given each room's box: a room beside you wins over one past a
 * corner, then the nearest whose top (or start edge) lines up with yours.
 */
export function neighbour(boxes, from, direction) {
  const [dx, dy] = DIRECTIONS[direction];
  const centre = b => [b.left + b.width / 2, b.top + b.height / 2];
  const here = boxes[from];
  if (!here) return null;
  const [cx, cy] = centre(here);
  let best = null, bestScore = Infinity;
  for (const [id, box] of Object.entries(boxes)) {
    if (id === from) continue;
    const overlapsAcross = dx ? box.top < here.top + here.height && here.top < box.top + box.height
      : box.left < here.left + here.width && here.left < box.left + box.width;
    const [x, y] = centre(box);
    const along = (x - cx) * dx + (y - cy) * dy;
    if (along <= 0) continue;
    const across = Math.abs(dx ? box.top - here.top : box.left - here.left);
    const score = along + across * 2 - (overlapsAcross ? 1e6 : 0);
    if (score < bestScore) { best = id; bestScore = score; }
  }
  return best;
}

/** One column of rooms: left and right walk the corridor in order, up and down scroll. */
export const isCorridor = boxes => new Set(Object.values(boxes).map(b => Math.round(b.left))).size === 1;

export function corridorStep(order, from, step) {
  const at = order.indexOf(from);
  return order[Math.min(order.length - 1, Math.max(0, at + step))];
}
