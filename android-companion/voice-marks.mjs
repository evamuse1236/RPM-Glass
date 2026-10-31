export const VOICE_STAGES = Object.freeze([
  {id: 'T0', mark: null, clock: 'cli', label: 'Tap mic'},
  {id: 'T1', mark: 'drawn', clock: 'page', label: 'Capture drawn'},
  {id: 'T2', mark: 'connecting', clock: 'page', label: 'Getting ready'},
  {id: 'T3', mark: 'mic', clock: 'page', label: 'Mic frame'},
  {id: 'T4', mark: 'listening', clock: 'page', label: 'Live ready'},
  {id: 'T5', mark: 'heard', clock: 'page', label: 'Heard words'},
  {id: 'T6', mark: null, clock: 'cli', label: 'Stop orb'},
  {id: 'T7', mark: 'tool', clock: 'page', label: 'Tool call'},
  {id: 'T8', mark: 'saved', clock: 'page', label: 'Saved'},
  {id: 'T9', mark: 'spoken', clock: 'page', label: 'Spoken'},
  {id: 'T10', mark: 'turn-done', clock: 'page', label: 'Turn done'},
]);

const once = new Set();
const armed = new Set();
const receipts = new Map();
let drawnQueued = false;

export function resetVoiceMarks() {
  once.clear();
  armed.clear();
  receipts.clear();
  drawnQueued = false;
  try { performance.clearMarks(); } catch { /* optional */ }
}

export function voiceDelayMs(name, env = globalThis) {
  if (env.__rpmVoiceTiming !== true) return 0;
  const delay = env.__rpmVoiceDelay;
  if (!delay || delay.stage !== name) return 0;
  const ms = Number(delay.ms);
  return Number.isFinite(ms) && ms > 0 ? ms : 300;
}

function sleepStage(name, ms, env) {
  if (typeof env.__rpmVoiceDelaySleep === 'function') {
    env.__rpmVoiceDelaySleep(ms, name);
    return;
  }
  const end = Date.now() + ms;
  while (Date.now() < end) { /* intentional sync stall for sensitivity checks */ }
}

export function beforeStage(name, env = globalThis) {
  const ms = voiceDelayMs(name, env);
  if (!ms) return null;
  if (typeof env.__rpmVoiceDelaySleep === 'function') {
    return Promise.resolve(env.__rpmVoiceDelaySleep(ms, name));
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function holdStage(name, env = globalThis) {
  const ms = voiceDelayMs(name, env);
  if (!ms) return;
  sleepStage(name, ms, env);
}

export function voiceMark(name, env = globalThis) {
  if (once.has(name)) return null;
  once.add(name);
  const mark = `voice:${name}`;
  try { env.performance?.mark?.(mark); } catch { /* mark API optional */ }
  if (env.__rpmVoiceTiming === true) {
    try {
      env.RpmNative?.diagnostic?.(JSON.stringify({
        kind: 'voice-mark',
        level: 'info',
        operation: 'voice.mark',
        outcome: 'success',
        payload: {name, mark},
      }));
    } catch { /* diagnostics must not change the turn */ }
  }
  return mark;
}

/** Marks every time new words reach the screen, so a timed run can see how far the words trail the voice. */
export function voiceWordsMark(env = globalThis) {
  if (env.__rpmVoiceTiming !== true) return;
  try { env.performance?.mark?.('voice:words'); } catch { /* mark API optional */ }
}

export function armVoiceMark(name) {
  armed.add(name);
}

export function voiceMarkIfArmed(name, env = globalThis) {
  if (!armed.has(name)) return null;
  armed.delete(name);
  return voiceMark(name, env);
}

/** Marks `name` (and T8 once) when the receipt for `messageId` is first drawn. */
export function armReceiptMark(messageId, name) {
  receipts.set(messageId, name);
}

export function receiptMarkIfArmed(messageId, env = globalThis) {
  const name = receipts.get(messageId);
  if (!name) return null;
  receipts.delete(messageId);
  voiceMark('T8', env);
  return voiceMark(name, env);
}

export function markCaptureDrawn(env = globalThis) {
  if (drawnQueued || once.has('T1')) return;
  drawnQueued = true;
  const frame = typeof env.requestAnimationFrame === 'function'
    ? env.requestAnimationFrame.bind(env)
    : fn => setTimeout(fn, 0);
  frame(() => { holdStage('T1', env); voiceMark('T1', env); });
}
