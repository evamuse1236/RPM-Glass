const REFUSED = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
const MAX_EMPTY_RUNS = 3;

/**
 * The browser's own speech recognizer, for display while the person talks: Gemini Live sends its transcript only
 * after Stop. `onWords(text)` gets everything heard so far. The saved words stay Gemini's. A browser with no
 * recognizer, or one that refuses, shows nothing and never blocks the ramble.
 */
export function liveWords({onWords, Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
  lang = globalThis.navigator?.language}) {
  if (typeof Recognition !== 'function') return {stop() {}};
  let active = true, done = '', recognizer = null, emptyRuns = 0;
  const open = () => {
    const r = new Recognition();
    Object.assign(r, {continuous: true, interimResults: true, ...(lang ? {lang} : {})});
    let part = '';
    r.onresult = event => {
      part = [...event.results].map(result => result[0]?.transcript ?? '').join('');
      onWords(`${done} ${part}`.replace(/\s+/g, ' ').trim());
    };
    r.onerror = event => { if (REFUSED.has(event.error)) active = false; };
    r.onend = () => {
      done = `${done} ${part}`.trim();
      emptyRuns = part ? 0 : emptyRuns + 1;
      if (active && emptyRuns < MAX_EMPTY_RUNS) open();
    };
    recognizer = r;
    try { r.start(); } catch { active = false; }
  };
  open();
  return {stop() { active = false; try { recognizer?.abort(); } catch {} }};
}
