const randomUUID = () => globalThis.crypto.randomUUID();

let source = randomUUID;

export const newId = () => source();

/**
 * Runs `run` with its new ids taken from `ids` in order while `accept` allows them, then random ones.
 * Returns what `run` returned and every id it was given, so a browser and the phone can agree on new ids.
 */
export function withIds(ids, run, accept = () => true) {
  const previous = source;
  const used = [];
  source = () => {
    const given = ids[used.length];
    const id = typeof given === 'string' && accept(given) ? given : randomUUID();
    used.push(id);
    return id;
  };
  try { return {result: run(), ids: used}; } finally { source = previous; }
}
