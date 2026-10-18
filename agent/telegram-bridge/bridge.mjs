import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { PiSupervisor, INTERRUPTED, deferred, pause } from './pi.mjs';

const ROOT = import.meta.dirname;
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 1_000_000;

export function splitReply(value, limit = 4000) {
  if (typeof value !== 'string' || !integer(limit, 2) || limit > 4000) throw new Error('Invalid reply');
  const chunks = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + limit, value.length);
    const code = value.charCodeAt(end - 1);
    if (end < value.length && code >= 0xd800 && code <= 0xdbff) end--;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length ? chunks : ['Pi completed the request without a text reply.'];
}

export function validateState(state) {
  if (!exactKeys(state, ['version', 'offset', 'jobs', 'scheduleKeys']) || state.version !== 1 || !integer(state.offset) || !Array.isArray(state.jobs) || !Array.isArray(state.scheduleKeys)) throw new Error('Invalid bridge state');
  const ids = new Set();
  for (const job of state.jobs) {
    if (!exactKeys(job, ['id', 'prompt', 'phase', 'chunks', 'nextChunk']) || !text(job.id) || ids.has(job.id) || !text(job.prompt) || !['queued', 'running', 'reply'].includes(job.phase) || !Array.isArray(job.chunks) || !integer(job.nextChunk)) throw new Error('Invalid bridge state');
    ids.add(job.id);
    if (job.phase === 'reply') {
      if (!job.chunks.length || !job.chunks.every(chunk => text(chunk) && chunk.length <= 4000) || job.nextChunk > job.chunks.length) throw new Error('Invalid bridge state');
    } else if (job.chunks.length || job.nextChunk !== 0) throw new Error('Invalid bridge state');
  }
  if (state.jobs.filter(job => job.phase === 'running').length > 1 || state.jobs.some((job, index) => index > 0 && job.phase !== 'queued')) throw new Error('Invalid bridge state');
  if (!state.scheduleKeys.every(key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/.test(key)) || new Set(state.scheduleKeys).size !== state.scheduleKeys.length) throw new Error('Invalid bridge state');
  return state;
}

export class StateStore {
  constructor(filename) { this.filename = filename; this.chain = Promise.resolve(); }

  async load() {
    let state;
    try { state = JSON.parse(await readFile(this.filename, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Cannot read valid bridge state');
      state = { version: 1, offset: 0, jobs: [], scheduleKeys: [] };
    }
    this.state = validateState(state);
    await this.transaction(next => {
      for (const job of next.jobs) if (job.phase === 'running') Object.assign(job, { phase: 'reply', chunks: splitReply(INTERRUPTED), nextChunk: 0 });
    });
  }

  snapshot() { return structuredClone(this.state); }

  transaction(change) {
    const result = this.chain.then(async () => {
      const next = this.snapshot();
      if (change(next) === false) return;
      validateState(next);
      const folder = path.dirname(this.filename);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      let file;
      try {
        file = await open(temporary, 'wx', 0o600);
        await file.writeFile(`${JSON.stringify(next)}\n`);
        await file.sync();
        await file.close();
        file = null;
        for (let attempt = 0;; attempt++) {
          try { await rename(temporary, this.filename); break; }
          catch (error) {
            if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 6) throw error;
            await pause(10 * 2 ** attempt);
          }
        }
        if (process.platform !== 'win32') {
          const directory = await open(folder, 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        }
        this.state = next;
      } finally {
        await file?.close();
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    });
    this.chain = result.catch(() => {});
    return result;
  }
}

export function validateSchedule(schedule) {
  if (!Array.isArray(schedule)) throw new Error('Invalid schedule');
  const seen = new Set();
  return schedule.map(entry => {
    if (!exactKeys(entry, ['at', 'prompt']) || typeof entry.at !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.at) || !text(entry.prompt)) throw new Error('Invalid schedule');
    const key = createHash('sha256').update(JSON.stringify([entry.at, entry.prompt])).digest('hex');
    if (seen.has(key)) throw new Error('Duplicate schedule entry');
    seen.add(key);
    return { ...entry, key };
  });
}

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function localMinute(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid clock');
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, at: `${parts.hour}:${parts.minute}` };
}

export function defaultPiArgs(folder = ROOT) {
  return ['--mode', 'rpc', '--provider', 'anthropic', '--model', 'claude-haiku-5-5', '--thinking', 'off', '--session-dir', path.join(folder, 'sessions'), '--continue', '--no-builtin-tools', '--no-extensions', '--no-mcp', '--no-skills', '--no-context-files', '--no-prompt-templates', '--tools', 'rpm_today', '-e', path.join(ROOT, 'extensions', 'rpm-tool.mjs')];
}

async function readSecret(filename) {
  if (typeof filename !== 'string' || !filename) throw new Error('Missing secret file configuration');
  let secret;
  try { secret = (await readFile(filename, 'utf8')).trim(); } catch { throw new Error('Cannot read secret file'); }
  if (!secret || secret.length > 10000 || /\s/.test(secret)) throw new Error('Invalid secret file');
  return secret;
}

export async function loadConfig(env = process.env) {
  const token = await readSecret(env.TELEGRAM_TOKEN_FILE);
  const anthropicKey = await readSecret(env.ANTHROPIC_KEY_FILE);
  let schedule;
  try { schedule = JSON.parse(await readFile(env.SCHEDULE_FILE || path.join(ROOT, 'schedule.json'), 'utf8')); }
  catch { throw new Error('Cannot read schedule'); }
  const childEnv = { ...env, ANTHROPIC_API_KEY: anthropicKey };
  delete childEnv.TELEGRAM_BOT_TOKEN;
  delete childEnv.TELEGRAM_TOKEN;
  const input = { token, allowedChatId: env.ALLOWED_CHAT_ID, stateFile: env.BRIDGE_STATE_FILE || path.join(ROOT, 'state.json'), schedule, piCommand: env.PI_BIN || 'pi', childEnv, log: event => console.log(event) };
  configure(input);
  return input;
}

export function configure(input) {
  const config = {
    telegramBaseUrl: 'https://api.telegram.org', pollTimeoutSeconds: 50, httpTimeoutMs: 65000,
    retryBaseMs: 1000, retryMaxMs: 30000, schedulerIntervalMs: 1000,
    restartBaseMs: 1000, restartMaxMs: 30000, healthyUptimeMs: 60000,
    turnTimeoutMs: 180000, shutdownGraceMs: 3000, piCommand: 'pi', piArgs: defaultPiArgs(),
    childEnv: { ...process.env }, cwd: ROOT, schedule: [], now: () => new Date(), log: () => {}, ...input,
  };
  if (typeof config.token !== 'string' || !/^\d+:[A-Za-z0-9_-]+$/.test(config.token) || typeof config.allowedChatId !== 'string' || !/^-?[1-9]\d*$/.test(config.allowedChatId) || !Number.isSafeInteger(Number(config.allowedChatId)) || typeof config.stateFile !== 'string' || !config.stateFile || config.stateFile.includes('\0')) throw new Error('Invalid bridge configuration');
  let url;
  try { url = new URL(config.telegramBaseUrl); } catch { throw new Error('Invalid Telegram base URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Telegram base URL');
  config.telegramBaseUrl = config.telegramBaseUrl.replace(/\/$/, '');
  if (typeof config.piCommand !== 'string' || !config.piCommand || config.piCommand.includes('\0') || !Array.isArray(config.piArgs) || !config.piArgs.every(arg => typeof arg === 'string' && !arg.includes('\0')) || !record(config.childEnv) || !Object.entries(config.childEnv).every(([key, value]) => !key.includes('\0') && typeof value === 'string' && !value.includes('\0')) || typeof config.cwd !== 'string' || !config.cwd || config.cwd.includes('\0') || typeof config.now !== 'function' || typeof config.log !== 'function') throw new Error('Invalid Pi configuration');
  for (const key of ['httpTimeoutMs', 'retryBaseMs', 'retryMaxMs', 'schedulerIntervalMs', 'restartBaseMs', 'restartMaxMs', 'healthyUptimeMs', 'turnTimeoutMs', 'shutdownGraceMs']) if (!integer(config[key], 1) || config[key] > 2_147_483_647) throw new Error('Invalid timer configuration');
  if (!integer(config.pollTimeoutSeconds) || config.pollTimeoutSeconds > 50 || config.retryBaseMs > config.retryMaxMs || config.restartBaseMs > config.restartMaxMs) throw new Error('Invalid retry configuration');
  config.schedule = validateSchedule(config.schedule);
  return config;
}

class TelegramError extends Error {
  constructor(transient, retryAfter = 0) { super('Telegram request failed'); this.transient = transient; this.retryAfter = retryAfter; }
}

export class Bridge {
  constructor(input) {
    this.config = configure(input);
    this.store = new StateStore(this.config.stateFile);
    this.controller = new AbortController();
    this.changed = deferred();
    this.started = false;
  }

  wake() { this.changed.resolve(); this.changed = deferred(); }

  async start() {
    if (this.started) throw new Error('Bridge already started');
    this.started = true;
    await this.store.load();
    if (this.controller.signal.aborted) return this;
    const c = this.config;
    this.pi = new PiSupervisor({ command: c.piCommand, args: c.piArgs, env: c.childEnv, cwd: c.cwd, restartBaseMs: c.restartBaseMs, restartMaxMs: c.restartMaxMs, healthyUptimeMs: c.healthyUptimeMs, turnTimeoutMs: c.turnTimeoutMs, shutdownGraceMs: c.shutdownGraceMs, log: c.log });
    this.pi.start();
    this.timer = setInterval(() => this.tick(c.now()).catch(() => this.fail()), c.schedulerIntervalMs);
    await this.tick(c.now());
    this.done = Promise.all([this.poll(), this.process()]).catch(async () => {
      if (!this.stopping) c.log('bridge_failure');
      this.fail();
      await this.pi.stop();
      if (!this.stopping) throw new Error('Bridge stopped after an operational failure');
    });
    this.done.catch(() => {});
    return this;
  }

  fail() { clearInterval(this.timer); this.controller.abort(); this.wake(); }

  async stop() {
    this.stopping = true;
    this.fail();
    await this.pi?.stop();
    await this.done;
    await this.store.chain;
  }

  async telegram(method, payload) {
    const c = this.config;
    let attempt = 0;
    while (!this.controller.signal.aborted) {
      let retryAfter = 0;
      try {
        let response;
        try {
          response = await fetch(`${c.telegramBaseUrl}/bot${c.token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(c.httpTimeoutMs)]) });
        } catch { throw new TelegramError(true); }
        let body;
        try { body = await response.json(); } catch { throw new TelegramError(response.status >= 500); }
        if (!response.ok || body?.ok !== true) {
          const status = integer(body?.error_code, 100) ? body.error_code : response.status;
          const after = body?.parameters?.retry_after;
          throw new TelegramError(status === 429 || status >= 500, integer(after, 1) ? Math.min(after * 1000, 2_147_483_647) : 0);
        }
        return body.result;
      } catch (error) {
        if (this.controller.signal.aborted) throw new Error('Stopped');
        if (!(error instanceof TelegramError) || !error.transient) throw new Error('Telegram rejected request');
        retryAfter = error.retryAfter;
      }
      c.log(method === 'getUpdates' ? 'telegram_poll_retry' : 'telegram_send_retry');
      const delay = Math.max(retryAfter, Math.min(c.retryMaxMs, c.retryBaseMs * 2 ** Math.min(attempt++, 30)));
      await pause(delay, this.controller.signal);
    }
    throw new Error('Stopped');
  }

  async poll() {
    while (!this.controller.signal.aborted) {
      const updates = await this.telegram('getUpdates', { offset: this.store.state.offset, timeout: this.config.pollTimeoutSeconds, allowed_updates: ['message'] });
      if (!Array.isArray(updates) || updates.some(update => !record(update) || !integer(update.update_id) || update.update_id >= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid Telegram updates');
      if (!updates.length) { await pause(25, this.controller.signal); continue; }
      await this.store.transaction(state => {
        for (const update of [...updates].sort((a, b) => a.update_id - b.update_id)) {
          if (update.update_id < state.offset) continue;
          state.offset = update.update_id + 1;
          const message = update.message;
          if (!integer(Math.abs(message?.chat?.id), 1) || String(message.chat.id) !== this.config.allowedChatId || !text(message.text)) continue;
          state.jobs.push({ id: `tg:${update.update_id}`, prompt: message.text, phase: 'queued', chunks: [], nextChunk: 0 });
        }
      });
      this.wake();
    }
  }

  async tick(date) {
    if (this.controller.signal.aborted) return;
    const { day, at } = localMinute(date);
    const matching = this.config.schedule.filter(entry => entry.at === at);
    if (!matching.length) return;
    if (matching.every(entry => this.store.state.scheduleKeys.includes(`${day}:${entry.key}`))) return;
    await this.store.transaction(state => {
      let added = false;
      for (const entry of matching) {
        const key = `${day}:${entry.key}`;
        if (state.scheduleKeys.includes(key)) continue;
        state.scheduleKeys.push(key);
        state.jobs.push({ id: `schedule:${key}`, prompt: entry.prompt, phase: 'queued', chunks: [], nextChunk: 0 });
        added = true;
      }
      return added;
    });
    this.wake();
  }

  async process() {
    while (!this.controller.signal.aborted) {
      const job = this.store.snapshot().jobs[0];
      if (!job) { await this.changed.promise; continue; }
      if (job.phase === 'queued') {
        await this.store.transaction(state => { state.jobs[0].phase = 'running'; });
        const reply = await this.pi.run(job.prompt);
        if (this.controller.signal.aborted) break;
        await this.store.transaction(state => { Object.assign(state.jobs[0], { phase: 'reply', chunks: splitReply(reply), nextChunk: 0 }); });
        continue;
      }
      if (job.phase !== 'reply') throw new Error('Invalid running job');
      if (job.nextChunk < job.chunks.length) {
        await this.telegram('sendMessage', { chat_id: this.config.allowedChatId, text: job.chunks[job.nextChunk] });
        await this.store.transaction(state => { state.jobs[0].nextChunk++; });
      } else {
        await this.store.transaction(state => { state.jobs.shift(); });
      }
    }
  }
}

export async function main() {
  let bridge;
  try {
    bridge = new Bridge(await loadConfig());
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { bridge.stop().catch(() => { process.exitCode = 1; }); });
    await bridge.start();
    await bridge.done;
  } catch {
    console.error('Telegram bridge stopped. Check configuration, state, and service access.');
    process.exitCode = 1;
    await bridge?.stop().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
