/** The real sync service from docs/web-sync.md: snapshot by ETag every 20 s, command statuses by cursor. */

export const KEYS = {base: 'rpm.web.baseUrl', token: 'rpm.web.token', cursor: 'rpm.web.cursor'};
const SNAPSHOT_MS = 20000, STATUS_MS = 5000;

export const LINK_ERROR = "That code didn't match. Codes last 10 minutes; ask the phone for a new one.";
const NO_SERVICE = "Can't reach the sync service. Your changes wait here and send when it answers.";
const STATUS_TEXT = {
  401: 'This browser is no longer linked. Link it again from the phone.',
  404: "The phone hasn't sent a copy of the plan yet. Open RPM on the phone.",
  429: 'Too many requests for now. Trying again shortly.',
};

export class HttpProblem extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createHttpTransport({storage, fetch = globalThis.fetch.bind(globalThis), timers = globalThis, label = 'Web browser'}) {
  let emit = () => {};
  let etag = null, snapshotTimer = null, statusTimer = null;
  const base = () => (storage.getItem(KEYS.base) ?? '').replace(/\/+$/, '');
  const token = () => storage.getItem(KEYS.token);

  async function call(method, path, {body, headers = {}} = {}) {
    let response;
    try {
      response = await fetch(base() + path, {method, headers: {
        ...(token() ? {Authorization: `Bearer ${token()}`} : {}),
        ...(body ? {'Content-Type': 'application/json'} : {}), ...headers,
      }, body: body ? JSON.stringify(body) : undefined});
    } catch {
      throw new HttpProblem(NO_SERVICE, 0);
    }
    if (response.status === 304) return {response, json: null};
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new HttpProblem(STATUS_TEXT[response.status] ?? json?.error?.message ?? NO_SERVICE, response.status, json?.error?.code ?? null); // rules-allow raw-error-text: the service's words become an HttpProblem that reaches the screen through userMessage
    }
    return {response, json};
  }

  function fail(problem) {
    if (problem.status === 401) {
      storage.removeItem(KEYS.token);
      emit({type: 'unlinked'});
    } else emit({type: 'error', error: problem});
  }

  async function pollSnapshot() {
    try {
      const {response, json} = await call('GET', '/v1/web/snapshot', {headers: etag ? {'If-None-Match': etag} : {}});
      if (json) {
        etag = response.headers.get('ETag');
        emit({type: 'snapshot', snapshot: json});
      }
    } catch (problem) {
      fail(problem);
    }
  }

  async function pollStatuses() {
    try {
      for (let more = true; more;) {
        const since = Number(storage.getItem(KEYS.cursor) ?? 0);
        const {json} = await call('GET', `/v1/web/commands?since=${since}`);
        for (const c of json.commands) emit({type: 'status', id: c.id, status: c.status, message: c.message, newRevision: c.newRevision});
        storage.setItem(KEYS.cursor, String(json.cursor));
        more = json.hasMore;
      }
    } catch (problem) {
      fail(problem);
    }
  }

  return {
    kind: 'http',
    pollSnapshot,
    pollStatuses,
    start(onEvent) {
      emit = onEvent;
      timers.clearInterval(snapshotTimer);
      timers.clearInterval(statusTimer);
      if (!token()) return emit({type: 'unlinked'});
      timers.setTimeout(() => { pollSnapshot(); pollStatuses(); }, 0);
      snapshotTimer = timers.setInterval(pollSnapshot, SNAPSHOT_MS);
      statusTimer = timers.setInterval(pollStatuses, STATUS_MS);
    },
    async send(command) {
      const {json} = await call('POST', '/v1/web/commands', {body: command});
      return json;
    },
    async link(code) {
      const {json} = await call('POST', '/v1/web/link', {body: {code, label}}).catch(problem => {
        throw [400, 401].includes(problem.status) ? new HttpProblem(LINK_ERROR, problem.status) : problem;
      });
      storage.setItem(KEYS.token, json.token);
      storage.setItem(KEYS.cursor, '0');
    },
    async unlink() {
      await call('DELETE', '/v1/web/session');
      storage.removeItem(KEYS.token);
    },
  };
}

export const hasHttpSettings = storage => !!(storage.getItem(KEYS.base) && storage.getItem(KEYS.token));
