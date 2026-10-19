/** Pixel art as rows: k ink, m stone-mid, l stone-light, s sand, . clear. One character is one game pixel. */

export const ART = {
  hero: [
    '................', '.....kkkkkk.....', '....kmmmmmmk....', '...kmmmmmmmmk...', '...kmmmmmmmmk...',
    '...kmssssssmk...', '...kssksskssk...', '...kssssssssk...', '....kssmmssk....', '.....kkkkkk.....',
    '....kllllllk....', '...kllllllllk...', '..kkllllllllkk..', '..kslllkklllsk..', '..kskllllllksk..',
    '...kllllllllk...', '...kmmmmmmmmk...', '...kmmmkkmmmk...', '...kmmk..kmmk...', '...kmmk..kmmk...',
    '...kkkk..kkkk...', '................', '...k.k.k.k.k....', '....k.k.k.k.....',
  ],
  heroStep: [
    '................', '.....kkkkkk.....', '....kmmmmmmk....', '...kmmmmmmmmk...', '...kmmmmmmmmk...',
    '...kmssssssmk...', '...kssksskssk...', '...kssssssssk...', '....kssmmssk....', '.....kkkkkk.....',
    '....kllllllk....', '...kllllllllk...', '..kkllllllllkk..', '..kslllkklllsk..', '..kskllllllksk..',
    '...kllllllllk...', '...kmmmmmmmmk...', '...kmmmkkmmmk...', '..kmmk....kmmk..', '..kmmk....kmmk..',
    '..kkkk....kkkk..', '................', '...k.k.k.k.k....', '....k.k.k.k.....',
  ],
  heart: [
    '................', '................', '..kkkk....kkkk..', '.kkkkkk..kkkkkk.', 'kkkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkkk', 'kkkkkkkkkkkkkkkk', '.kkkkkkkkkkkkkk.', '..kkkkkkkkkkkk..', '...kkkkkkkkkk...',
    '....kkkkkkkk....', '.....kkkkkk.....', '......kkkk......', '.......kk.......', '................', '................',
  ],
  drop: [
    '.......kk.......', '.......kk.......', '......kkkk......', '......kkkk......', '.....kkkkkk.....',
    '....kkkkkkkk....', '...kkkkkkkkkk...', '...kkkkkkkkkk...', '..kkkkkkkkkkkk..', '..kksskkkkkkkk..',
    '..kksskkkkkkkk..', '..kkkskkkkkkkk..', '...kkkkkkkkkk...', '....kkkkkkkk....', '......kkkk......', '................',
  ],
  hourglass: ['kkkkkk', '.kssk.', '..kk..', '..kk..', '.kkkk.', 'kkkkkk'],
  phone: [
    '................', '....kkkkkkkk....', '...kkkkkkkkkk...', '...kssssssssk...', '...kssssssssk...',
    '...ksskkkkssk...', '...kssssssssk...', '...ksskkkkssk...', '...kssssssssk...', '...kssssssssk...',
    '...kssssssssk...', '...kkkkkkkkkk...', '...kkkkssskkk...', '...kkkkkkkkkk...', '....kkkkkkkk....', '................',
  ],
  star: [
    '................', '.......kk.......', '.......kk.......', '......kkkk......', '......kkkk......',
    'kkkkkkkkkkkkkkkk', '.kkkkkkkkkkkkkk.', '..kkkkkkkkkkkk..', '....kkkkkkkk....', '....kkkkkkkk....',
    '...kkkkkkkkkk...', '...kkkk..kkkk...', '..kkk......kkk..', '..k..........k..', '................', '................',
  ],
  check: [
    '................', '................', '................', '.............kk.', '............kkk.',
    '...........kkk..', '..kk......kkk...', '..kkk....kkk....', '...kkk..kkk.....', '....kkkkkk......',
    '.....kkkk.......', '......kk........', '................', '................', '................', '................',
  ],
  plus: [
    '................', '................', '................', '......kkkk......', '......kkkk......',
    '......kkkk......', '..kkkkkkkkkkkk..', '..kkkkkkkkkkkk..', '..kkkkkkkkkkkk..', '..kkkkkkkkkkkk..',
    '......kkkk......', '......kkkk......', '......kkkk......', '................', '................', '................',
  ],
  right: [
    '................', '................', '.....k..........', '.....kk.........', '.....kkk........',
    '.....kkkk.......', '.....kkkkk......', '.....kkkkkk.....', '.....kkkkkk.....', '.....kkkkk......',
    '.....kkkk.......', '.....kkk........', '.....kk.........', '.....k..........', '................', '................',
  ],
  flag: [
    '................', '..kkkkkkkkk.....', '..kmmmmmmmmk....', '..kmmmmmmmmmk...', '..kmmmmmmmmk....',
    '..kmmmmmmmk.....', '..kkkkkkkk......', '..k.............', '..k.............', '..k.............',
    '..k.............', '..k.............', '..k.............', '.kkk............', 'kkkkk...........', '................',
  ],
  ladder: [
    'kk..........kk..', 'klk........klk..', 'klkkkkkkkkkklk..', 'klllllllllllllk.', 'kkkkkkkkkkkkkk..',
    'klk........klk..', 'klk........klk..', 'klk........klk..', 'klkkkkkkkkkklk..', 'klllllllllllllk.',
    'kkkkkkkkkkkkkk..', 'klk........klk..', 'klk........klk..', 'klk........klk..', 'klkkkkkkkkkklk..',
    'klllllllllllllk.', 'kkkkkkkkkkkkkk..', 'klk........klk..', 'klk........klk..', 'klk........klk..',
    'klkkkkkkkkkklk..', 'klllllllllllllk.', 'kkkkkkkkkkkkkk..', 'klk........klk..', 'klk........klk..',
    'klk........klk..', 'klkkkkkkkkkklk..', 'klllllllllllllk.', 'kkkkkkkkkkkkkk..', 'klk........klk..',
    'k.k........k.k..', 'k.k........k.k..',
  ],
  cursor: ['k.....', 'kk....', 'kkk...', 'kkkk..', 'kkkkk.', 'kkkk..', 'kkk...', 'kk....', 'k.....'],
};

const filledAt = (rows, x, y) => rows[y]?.[x] != null && rows[y][x] !== '.';

/** Keep a sprite's edge and clear its inside: the empty heart, the empty droplet. */
export function outline(rows) {
  return rows.map((row, y) => [...row].map((c, x) => {
    if (c === '.') return '.';
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !filledAt(rows, x + dx, y + dy));
    return edge ? 'k' : '.';
  }).join(''));
}

/** Every other edge pixel: the dashed droplet of a glass still on its way to the phone. */
export const dashed = rows => outline(rows).map((row, y) => [...row].map((c, x) => (c === 'k' && (x + y) % 2 ? '.' : c)).join(''));

/** Rows to SVG: one path per tone, a run of pixels per rect, crisp at any whole scale. */
export function toSvg(rows, {title = null, cls = ''} = {}) {
  const width = rows[0].length, height = rows.length;
  const paths = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < width;) {
      const c = row[x];
      let run = 1;
      while (row[x + run] === c) run++;
      if (c !== '.') (paths[c] ??= []).push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  });
  const body = Object.entries(paths).map(([tone, d]) => `<path class="t-${tone}" d="${d.join('')}"/>`).join('');
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="px ${cls}" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}" shape-rendering="crispEdges" ${label}>${body}</svg>`;
}
