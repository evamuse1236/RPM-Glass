const KEY = 'rpm.web.v1';
const FINAL = new Set(['applied', 'rejected', 'conflict']);

export class HttpError extends Error {
  constructor(status, code, message, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}

export function problemText(error) {
  if (error instanceof HttpError) {
    if (error.status === 401) return 'That code did not work. Codes last ten minutes and work once. Make a new one on the phone.';
    if (error.status === 429) return `Too many requests. Trying again in ${error.retryAfter ?? 60} seconds.`;
    if (error.status === 403) return 'This website address is not allowed by the sync server.';
    if (error.status === 400) return 'The sync server did not accept that request.';
    return 'The sync server is having trouble. Your changes wait here and send when it is back.';
  }
  return 'Can\'t reach the sync server. Your changes wait here and send when it is back.';
}

/** Browser side of docs/web-sync.md. The phone is the only writer; this keeps a durable outbox and reads snapshots. */
export function createClient({server, storage = globalThis.localStorage, fetchImpl = globalThis.fetch.bind(globalThis)}) {
  const saved = JSON.parse(storage.getItem(KEY) ?? 'null') ?? {};
  const state = {server: saved.server ?? server, token: saved.token ?? null, cursor: saved.cursor ?? 0, outbox: saved.outbox ?? [],
    snapshot: saved.snapshot ?? null, etag: saved.etag ?? null, phoneMissing: false, offline: null, unlinked: false};
  const listeners = new Set();
  const persist = () => storage.setItem(KEY, JSON.stringify({server: state.server, token: state.token, cursor: state.cursor, outbox: state.outbox, snapshot: state.snapshot, etag: state.etag}));
  const emit = () => { persist(); listeners.forEach(fn => fn(state)); };

  async function call(path, {method = 'GET', body, headers = {}, auth = true} = {}) {
    const response = await fetchImpl(new URL(path, state.server), {method, cache: 'no-store',
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...(auth ? {Authorization: `Bearer ${state.token}`} : {}), ...headers},
      body: body ? JSON.stringify(body) : undefined});
    if (response.status === 304) return {status: 304};
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (auth && response.status === 401) { state.unlinked = true; }
      throw new HttpError(response.status, data?.error?.code, data?.error?.message ?? 'Request failed', +response.headers.get('Retry-After') || undefined);
    }
    return {status: response.status, data, etag: response.headers.get('ETag')};
  }
  const guarded = async work => {
    try { const result = await work(); state.offline = null; return result; }
    catch (error) { state.offline = problemText(error); if (!(error instanceof HttpError) || error.status >= 429) return null; throw error; }
    finally { emit(); }
  };

  async function refresh() {
    if (!state.token) return;
    try {
      const reply = await call('/v1/web/snapshot', {headers: state.etag ? {'If-None-Match': state.etag} : {}});
      state.offline = null; state.phoneMissing = false;
      if (reply.status !== 304) { state.snapshot = reply.data; state.etag = reply.etag; }
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) state.phoneMissing = true;
      else if (!(error instanceof HttpError && error.status === 401)) state.offline = problemText(error);
    }
    emit();
  }

  async function deliver(entry) {
    try {
      const {data} = await call('/v1/web/commands', {method: 'POST', body: entry.command});
      Object.assign(entry, {status: data.status, message: data.message, newRevision: data.newRevision});
      state.offline = null;
    } catch (error) {
      if (error instanceof HttpError && error.status !== 429 && error.status < 500 && error.status !== 401) Object.assign(entry, {status: 'rejected', message: 'The sync server did not accept this change.'});
      else state.offline = problemText(error);
    }
  }

  async function poll() {
    if (!state.token || !state.outbox.some(e => e.status === 'pending')) return;
    await guarded(async () => {
      for (let page = 0; page < 10; page++) {
        const {data} = await call(`/v1/web/commands?since=${state.cursor}`);
        for (const update of data.commands) {
          const entry = state.outbox.find(e => e.command.id === update.id);
          if (entry && !FINAL.has(entry.status)) Object.assign(entry, {status: update.status, message: update.message, newRevision: update.newRevision});
        }
        state.cursor = data.cursor;
        if (!data.hasMore) break;
      }
    });
    if (state.outbox.some(e => e.status === 'applied' && (state.snapshot?.revision ?? -1) < e.newRevision)) await refresh();
  }

  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** An entry is settled once the phone has decided and, if applied, the snapshot shows it. */
    settled: entry => FINAL.has(entry.status) && (entry.status !== 'applied' || (state.snapshot?.revision ?? -1) >= entry.newRevision),
    /** On a ChatGPT Site the Site holds the phone's key, so the page opens without a code. */
    async connect() {
      if (state.token) return;
      const reply = await call('/v1/site', {auth: false}).catch(() => null);
      if (!reply?.data?.site) return;
      Object.assign(state, {token: 'site', cursor: 0, outbox: [], snapshot: null, etag: null, unlinked: false, phoneMissing: false});
      emit();
      await refresh();
    },
    async link(code, label) {
      const {data} = await call('/v1/web/link', {method: 'POST', auth: false, body: {code: code.trim().toUpperCase(), ...(label ? {label} : {})}});
      Object.assign(state, {token: data.token, cursor: 0, outbox: [], snapshot: null, etag: null, unlinked: false, phoneMissing: false});
      emit();
      await refresh();
    },
    async unlink() {
      try { if (state.token) await call('/v1/web/session', {method: 'DELETE'}); } catch {}
      Object.assign(state, {token: null, cursor: 0, outbox: [], snapshot: null, etag: null, unlinked: false});
      emit();
    },
    async send(command) {
      const entry = {command, status: 'sending', message: 'Sending', newRevision: null};
      state.outbox = [...state.outbox.filter(e => !FINAL.has(e.status) || state.outbox.indexOf(e) >= state.outbox.length - 20), entry];
      emit();
      await deliver(entry); emit();
      return entry;
    },
    refresh, poll,
    async tick() {
      for (const entry of state.outbox.filter(e => e.status === 'sending')) await deliver(entry);
      await poll();
      await refresh();
    },
  };
}
