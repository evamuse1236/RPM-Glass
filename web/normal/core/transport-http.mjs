/** The real browser API from docs/web-sync.md: snapshot by ETag every 20 s, commands by POST, statuses by cursor. */
export const POLL_MS = 20000;
export const STATUS_MS = 5000;
const KEYS = {base: 'rpm.web.base', token: 'rpm.web.token', cursor: 'rpm.web.cursor'};

export const readConfig = storage => ({base: storage?.getItem(KEYS.base) ?? '', token: storage?.getItem(KEYS.token) ?? ''});

const FRIENDLY = {
  401: "This browser isn't linked any more.",
  403: 'This address is not allowed to reach your planner.',
  409: 'This change was already sent with different details.',
  413: 'That is too long to send.',
  429: 'Too many requests. Wait a minute, then try again.',
  503: 'The sync service is busy. Try again in a minute.',
};

export class HttpProblem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function problem(response) {
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  const said = body?.error ?? {};
  return new HttpProblem(response.status, FRIENDLY[response.status] ?? said.message ?? 'The sync service did not answer as expected.');
}

export function httpTransport({base, token, fetch = globalThis.fetch.bind(globalThis), storage = null, timers = globalThis, now = () => Date.now()}) {
  const root = base.replace(/\/+$/, '');
  let auth = token, etag = null, dispatch = () => {}, pollTimer = null, statusTimer = null;
  let cursor = Number(storage?.getItem(KEYS.cursor) ?? 0) || 0;
  const pending = new Set();
  const headers = (extra = {}) => ({Authorization: `Bearer ${auth}`, ...extra});

  async function call(path, init = {}) {
    let response;
    try {
      response = await fetch(root + path, {...init, cache: 'no-store'});
    } catch {
      throw new HttpProblem(0, "Can't reach the sync service. Your changes wait here.");
    }
    if (response.status === 401) dispatch({type: 'unlinked'});
    return response;
  }

  async function pollSnapshot() {
    const response = await call('/v1/web/snapshot', {headers: headers(etag ? {'If-None-Match': etag} : {})});
    if (response.status === 304) return dispatch({type: 'checked', at: now()});
    if (response.status === 404) return dispatch({type: 'no-snapshot'});
    if (!response.ok) throw await problem(response);
    etag = response.headers.get('ETag');
    dispatch({type: 'loaded', snapshot: await response.json(), at: now()});
  }

  async function pollStatuses() {
    for (let more = true; more;) {
      const response = await call(`/v1/web/commands?since=${cursor}`, {headers: headers()});
      if (!response.ok) throw await problem(response);
      const page = await response.json();
      for (const c of page.commands) {
        if (c.status === 'pending') continue;
        pending.delete(c.id);
        dispatch({type: 'status', id: c.id, status: c.status, message: c.message, newRevision: c.newRevision});
      }
      cursor = page.cursor;
      storage?.setItem(KEYS.cursor, String(cursor));
      more = !!page.hasMore;
    }
  }

  async function poll() {
    dispatch({type: 'syncing', syncing: true});
    try {
      await pollSnapshot();
      await pollStatuses();
    } catch (error) {
      dispatch({type: 'failed', problem: error});
    } finally {
      dispatch({type: 'syncing', syncing: false});
    }
  }

  function watchStatuses() {
    if (statusTimer || !pending.size) return;
    statusTimer = timers.setTimeout(async () => {
      statusTimer = null;
      try { await pollStatuses(); } catch (error) { dispatch({type: 'failed', problem: error}); }
      if (pending.size) await pollSnapshot().catch(error => dispatch({type: 'failed', problem: error}));
      watchStatuses();
    }, STATUS_MS);
  }

  return {
    kind: 'http',
    start(fn) {
      dispatch = fn;
      if (!auth) return dispatch({type: 'unlinked'});
      poll();
      pollTimer = timers.setInterval(poll, POLL_MS);
    },
    stop() {
      timers.clearInterval(pollTimer);
      timers.clearTimeout(statusTimer);
    },
    poll,
    async send(command) {
      const response = await call('/v1/web/commands', {method: 'POST', headers: headers({'Content-Type': 'application/json'}), body: JSON.stringify(command)});
      if (!response.ok) throw await problem(response);
      const result = await response.json();
      if (result.status === 'pending') {
        pending.add(command.id);
        watchStatuses();
      } else {
        dispatch({type: 'status', id: command.id, status: result.status, message: result.message, newRevision: result.newRevision});
      }
      return result;
    },
    cancel: () => false,
    async link(code, label = 'Browser') {
      const response = await call('/v1/web/link', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code, label})});
      if (response.status === 401 || response.status === 400) {
        throw new HttpProblem(response.status, "That code didn't match. Codes last 10 minutes; ask the phone for a new one.");
      }
      if (!response.ok) throw await problem(response);
      const linked = await response.json();
      auth = linked.token;
      storage?.setItem(KEYS.token, auth);
      storage?.setItem(KEYS.base, root);
      etag = null;
      await poll();
      if (!pollTimer) pollTimer = timers.setInterval(poll, POLL_MS);
      return linked;
    },
    async unlink() {
      try { await call('/v1/web/session', {method: 'DELETE', headers: headers()}); } finally {
        storage?.removeItem(KEYS.token);
        auth = '';
        dispatch({type: 'unlinked'});
      }
    },
  };
}
