/**
 * The notch's own saves, in a WebView with no screen (NotchRunner.java): load the store, apply one request with the
 * planner's change logic (notch-ops.mjs), save it with the version it was read at, and answer the notch. A save the
 * phone refuses because the store changed underneath (the planner saved first) reads the store again once. Every
 * error the notch shows passes through userMessage.
 */
import {runNotchRequest} from './notch-ops.mjs';
import {userMessage} from './user-message.mjs';

const waiting = new Map(), session = crypto.randomUUID();
let serial = 0;

window.rpmBridgeResult = (id, result, error) => {
  const call = waiting.get(id);
  if (!call) return;
  waiting.delete(id);
  if (error) call.reject(new Error(error));
  else call.resolve(result);
};

const native = (action, payload = {}) => new Promise((resolve, reject) => {
  const id = `${session}:${++serial}`;
  waiting.set(id, {resolve, reject});
  window.RpmNotch.invoke(id, action, JSON.stringify(payload));
});

const changedUnderneath = error => /saved context changed/i.test(String(error?.message ?? error));

// The store as last read or saved here, so a tap only applies and saves. Anything that fails from this copy (the store
// may have changed since) is tried once more from a fresh read.
let kept = null;

/** Reads the store ahead of a tap, when the island opens. */
window.rpmNotchPreload = async () => {
  try {
    kept = (await native('load')).data;
  } catch {
    kept = null;
  }
};

async function attempt(request, fresh) {
  const data = !fresh && kept ? kept : (await native('load')).data;
  kept = null;
  if (!data) throw new Error('Open RPM once to set up your plan.');
  const next = structuredClone(data);
  const result = runNotchRequest(next, request, new Date());
  next.version = data.version + 1;
  await native('save', {expected: data.version, data: next});
  kept = next;
  return result;
}

window.rpmNotchRun = async (id, request) => {
  let answer;
  try {
    const fromKept = !!kept;
    try {
      answer = {ok: true, ...await attempt(request, false)};
    } catch (error) {
      if (!fromKept && !changedUnderneath(error)) throw error;
      answer = {ok: true, ...await attempt(request, true)};
    }
  } catch (error) {
    answer = {ok: false, message: userMessage(error)};
  }
  window.RpmNotch.finish(id, JSON.stringify(answer));
};

window.RpmNotch.ready();
