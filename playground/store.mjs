export const KEYS = Object.freeze({
  companion: 'rpm-playground:companion',
  prefs: 'rpm-playground:prefs',
  draft: 'rpm-playground:capture-draft',
  device: 'rpm-playground:device',
  shell: 'rpm-playground:shell',
});

const DEFAULT_PREFS = Object.freeze({widgetTextScale: 100, calendarPermitted: false, calendarSelected: [], notchOn: true,
  diagnosticsPaused: false});
const DEFAULT_DEVICE = Object.freeze({dark: false, textScale: 1});

export function readJson(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('The browser could not keep this much data. Download it, then Reset.'); }
}

export const companion = () => readJson(KEYS.companion);
export const writeCompanion = data => writeJson(KEYS.companion, data);
export const prefs = () => ({...DEFAULT_PREFS, ...readJson(KEYS.prefs, {})});
export const setPrefs = patch => writeJson(KEYS.prefs, {...prefs(), ...patch});
export const device = () => ({...DEFAULT_DEVICE, ...readJson(KEYS.device, {})});
export const setDevice = patch => writeJson(KEYS.device, {...device(), ...patch});

export function wipeAppDataThenWrite(data) {
  const keep = [KEYS.device, KEYS.shell].map(key => [key, localStorage.getItem(key)]);
  localStorage.clear();
  for (const [key, value] of keep) if (value != null) localStorage.setItem(key, value);
  if (data) writeCompanion(data);
}

export function validateLikeCompanionStore(d) {
  if (!d || typeof d !== 'object' || d.schema !== 2 || !Number.isInteger(d.version) || d.version < 0) throw new Error('Unsupported context format.');
  for (const k of ['entries', 'memories', 'history', 'conversations']) if (!Array.isArray(d[k])) throw new Error('Unsupported context format.');
  if (!d.conversations.length) throw new Error('A conversation is required.');
  return d;
}
