import {startVoice as startLive, VoiceError} from '../../android-companion/voice-client.mjs';
import {liveSetup} from '../../android-companion/voice-tools.mjs';
import {userMessage} from '../../android-companion/user-message.mjs';
import {voiceCount, voiceRow} from './voice-rows.mjs';

const SAVED = /\s*Your words are saved\.?/g;
const ACTIVE = new Set(['connecting', 'listening', 'working', 'speaking']);

/**
 * Ends one ramble: the heard words go first as a voice capture (a journal, no text model), then the ramble's
 * one batch goes through the queue as one plan command on the browser's ids. Returns what the panel shows.
 */
export async function settleRamble({result, client, queue, timeZone, uuid = () => crypto.randomUUID(), now = () => new Date()}) {
  const heard = result.heard ?? '';
  const planId = result.batch && !result.failed ? uuid() : null;
  let saved = false;
  const snap = client.state.snapshot;
  if (heard && snap) {
    await client.send({id: uuid(), type: 'capture', args: {text: heard, source: 'voice', ...(planId ? {planCommandId: planId} : {})},
      timezone: timeZone, baseRevision: snap.revision, createdAt: now().toISOString()});
    saved = true;
  }
  if (result.failed) return {phase: 'failed', heard, saved, error: result.failed, code: result.code ?? null};
  if (!planId) return {phase: 'done', heard, saved, said: result.said ?? '', changes: [], commandId: null};
  try {
    queue.commit(result.batch, {id: planId, uuids: result.uuids, tasks: result.created});
  } catch (error) {
    return {phase: 'failed', heard, saved, error: userMessage(error), code: null};
  }
  return {phase: 'done', heard, saved, said: result.said ?? '', changes: result.changes, commandId: planId};
}

/** The token the server mints for this time zone; a server with no key hides the mic for this page. */
export function voiceToken(client, timeZone) {
  return async () => {
    try { return await client.voiceToken(timeZone); }
    catch (error) {
      if (error?.code === 'voice_unavailable') throw new VoiceError('voice_unavailable', 'Voice is not set up on this server.');
      throw error;
    }
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function changeItem(change, timeZone) {
  const row = voiceRow(change, timeZone);
  const item = el('li', 'voice-change');
  const icon = el('span', 'ms', row.icon);
  icon.setAttribute('aria-hidden', 'true');
  const body = el('div', 'voice-change-body');
  const line = el('p', 'voice-change-title');
  line.append(el('span', 'voice-change-verb', row.verb), document.createTextNode(` ${row.title}`));
  body.append(line);
  if (row.detail) body.append(el('p', 'voice-change-detail', row.detail));
  item.append(icon, body);
  return item;
}

/** The mic in the website's Capture sheet: its button, its panel and the states of docs/voice-mode.md. */
export function mountVoice({client, queue, render, onRetry, start = startLive, workletUrl = '/voice-mic-worklet.js'}) {
  const $ = id => document.getElementById(id);
  const form = $('capture-form'), mic = $('voice-mic'), panel = $('voice-panel');
  const status = $('voice-status'), heard = $('voice-heard'), list = $('voice-changes'), said = $('voice-said'), note = $('voice-note');
  const stopButton = $('voice-stop'), undoButton = $('voice-undo'), retryButton = $('voice-retry');
  let session = null, view = null, unavailable = !globalThis.navigator?.mediaDevices?.getUserMedia || typeof globalThis.AudioWorkletNode !== 'function';
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  function show(next) {
    view = next;
    const phase = next?.phase ?? null;
    form.dataset.voice = phase ?? '';
    panel.hidden = !phase;
    mic.setAttribute('aria-pressed', String(phase === 'connecting' || phase === 'listening'));
    mic.setAttribute('aria-label', phase === 'listening' ? 'Stop and save' : 'Talk to RPM');
    mic.querySelector('.ms').textContent = phase === 'listening' || phase === 'connecting' ? 'stop' : 'mic';
    if (!phase) return refresh();
    const changes = next.changes ?? [];
    const failed = phase === 'failed' || phase === 'no-mic';
    status.textContent = {connecting: 'Connecting…', listening: 'Listening', working: 'Saving your changes', speaking: 'Saving your changes',
      done: next.undone ? 'Changes undone' : voiceCount(changes), 'no-mic': 'Allow the microphone to talk to RPM.',
      failed: next.saved ? 'Your words are saved.' : 'Nothing was saved.'}[phase];
    heard.textContent = next.heard ?? '';
    heard.hidden = !next.heard || phase === 'done';
    list.replaceChildren(...(phase === 'failed' || next.undone ? [] : changes.map(change => changeItem(change, zone()))));
    list.hidden = !list.children.length;
    said.textContent = phase === 'done' && !next.undone ? next.said ?? '' : '';
    said.hidden = !said.textContent;
    const detail = phase === 'no-mic' ? 'Typing still works.' : phase === 'failed' ? (next.error ?? '').replace(SAVED, '').trim()
      : next.undone ? 'Your words are saved.' : '';
    note.textContent = detail;
    note.hidden = !detail;
    note.classList.toggle('voice-note-error', failed);
    stopButton.hidden = !(phase === 'connecting' || phase === 'listening');
    undoButton.hidden = !(phase === 'done' && next.commandId && !next.undone && queue.lastUndoId() === next.commandId);
    retryButton.hidden = !(phase === 'failed' && next.heard);
    refresh();
  }

  function refresh() {
    mic.hidden = unavailable;
    const busy = !!view && ACTIVE.has(view.phase), talking = view?.phase === 'connecting' || view?.phase === 'listening';
    mic.disabled = busy ? !talking : queue.pendingIds().size > 0 || !queue.data();
    mic.title = mic.disabled && !busy ? 'Wait for your changes to send' : '';
  }

  async function begin() {
    const data = queue.data();
    if (!data || queue.pendingIds().size) return refresh();
    const timeZone = zone();
    show({phase: 'connecting', heard: '', changes: []});
    const live = start({data, timeZone, setup: liveSetup(new Date(), timeZone), token: voiceToken(client, timeZone), workletUrl,
      onChange: state => { if (session === live && ACTIVE.has(state.phase)) show({...state}); }});
    session = live;
    const result = await live.done;
    if (session !== live) return;
    session = null;
    if (result.code === 'voice_unavailable') { unavailable = true; show(null); return; }
    if (result.code === 'no-mic') { show({phase: 'no-mic'}); return; }
    show({phase: 'working', heard: result.heard, changes: result.changes});
    show(await settleRamble({result, client, queue, timeZone}));
    render();
  }

  mic.addEventListener('click', () => {
    if (view?.phase === 'listening' || view?.phase === 'connecting') session?.stop();
    else if (!session) begin().catch(error => show({phase: 'failed', heard: '', saved: false, error: userMessage(error)}));
  });
  stopButton.addEventListener('click', () => session?.stop());
  undoButton.addEventListener('click', () => {
    try { queue.commit({type: 'undo'}); show({...view, undone: true}); }
    catch (error) { show({...view, phase: 'failed', error: userMessage(error)}); }
    render();
  });
  retryButton.addEventListener('click', () => { const words = view?.heard ?? ''; show(null); onRetry(words); });

  return {
    refresh,
    /** A newly opened sheet starts without the last receipt. */
    opened() { if (!session) show(null); },
    /** Closing the sheet while listening stops and saves, as the Stop button does. */
    closed() { if (view?.phase === 'connecting' || view?.phase === 'listening') session?.stop(); },
  };
}
