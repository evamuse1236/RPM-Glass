import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

export const INTERRUPTED = 'The request was interrupted. Please send it again if you still need a reply.';
export const FAILED = 'Pi could not complete this request. Please try again.';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Stopped'));
    const abort = () => { clearTimeout(timer); reject(new Error('Stopped')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class PiSupervisor {
  constructor(options) {
    this.options = options;
    this.controller = new AbortController();
    this.changed = deferred();
    this.child = null;
    this.stopping = false;
    this.failures = 0;
  }

  start() {
    if (!this.lifecycle) this.lifecycle = this.supervise();
  }

  notify() { this.changed.resolve(); this.changed = deferred(); }

  async supervise() {
    const o = this.options;
    while (!this.stopping) {
      const started = Date.now();
      const generation = { pending: new Map(), closed: deferred(), ready: false, turn: null, healthy: false };
      const child = spawn(o.command, o.args, { env: o.env, cwd: o.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      generation.process = child;
      this.child = generation;
      const decoder = new StringDecoder('utf8');
      let buffer = '';
      child.stdout.on('data', data => {
        buffer += decoder.write(data);
        if (buffer.length > 10_000_000) { child.kill('SIGKILL'); return; }
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line.trim()) continue;
          try { this.receive(generation, JSON.parse(line)); }
          catch { child.kill('SIGKILL'); }
        }
      });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.on('error', () => {});
      child.once('spawn', () => { generation.ready = true; this.notify(); });
      child.once('close', () => {
        generation.ready = false;
        for (const waiting of generation.pending.values()) waiting.reject(new Error('Pi interrupted'));
        generation.pending.clear();
        generation.turn?.settled.reject(new Error('Pi interrupted'));
        if (this.child === generation) this.child = null;
        generation.closed.resolve();
        this.notify();
      });
      await generation.closed.promise;
      if (this.stopping) break;
      if (generation.healthy || Date.now() - started >= o.healthyUptimeMs) this.failures = 0;
      const delay = Math.min(o.restartMaxMs, o.restartBaseMs * 2 ** Math.min(this.failures++, 30));
      o.log?.('pi_restart');
      try { await pause(delay, this.controller.signal); } catch { break; }
    }
  }

  receive(generation, event) {
    if (!event || typeof event !== 'object') throw new Error('Invalid Pi event');
    if (event.type === 'response') {
      const pending = generation.pending.get(event.id);
      if (pending) {
        generation.pending.delete(event.id);
        if (event.command !== pending.command || event.success !== true) pending.reject(new Error('Pi command failed'));
        else pending.resolve(event);
      }
    }
    if (event.type === 'message_end' && event.message?.role === 'assistant' && generation.turn) {
      generation.turn.assistantSeen = true;
      generation.turn.failed = ['error', 'aborted'].includes(event.message.stopReason);
    }
    if (event.type === 'agent_settled') generation.turn?.settled.resolve();
  }

  request(generation, command, fields = {}) {
    const waiting = deferred();
    const id = randomUUID();
    generation.pending.set(id, { ...waiting, command });
    generation.process.stdin.write(`${JSON.stringify({ id, type: command, ...fields })}\n`, error => {
      if (error) { generation.pending.delete(id); waiting.reject(new Error('Pi interrupted')); }
    });
    return waiting.promise;
  }

  async run(prompt) {
    while (!this.stopping && !this.child?.ready) await this.changed.promise;
    if (this.stopping) throw new Error('Stopped');
    const generation = this.child;
    const turn = { settled: deferred(), failed: false, assistantSeen: false };
    turn.settled.promise.catch(() => {});
    generation.turn = turn;
    const timeout = setTimeout(() => generation.process.kill('SIGKILL'), this.options.turnTimeoutMs);
    try {
      const ack = await this.request(generation, 'prompt', { message: prompt });
      const disposition = ack.data?.disposition;
      if (disposition === 'handled') return 'Pi handled the request without starting an assistant reply.';
      if (disposition !== undefined && !['started', 'queued'].includes(disposition)) throw new Error('Invalid Pi disposition');
      await turn.settled.promise;
      if (turn.failed || !turn.assistantSeen) return FAILED;
      const result = await this.request(generation, 'get_last_assistant_text');
      if (!result.data || (result.data.text !== null && typeof result.data.text !== 'string')) throw new Error('Invalid Pi reply');
      generation.healthy = true;
      return result.data.text?.trim() ? result.data.text : 'Pi completed the request without a text reply.';
    } catch {
      generation.process.kill('SIGKILL');
      await generation.closed.promise;
      return INTERRUPTED;
    } finally {
      clearTimeout(timeout);
      generation.turn = null;
    }
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.finishStop();
    return this.stopPromise;
  }

  async finishStop() {
    this.stopping = true;
    this.controller.abort();
    this.notify();
    const generation = this.child;
    if (generation) {
      generation.process.stdin.end();
      const timer = setTimeout(() => generation.process.kill('SIGKILL'), this.options.shutdownGraceMs);
      await generation.closed.promise;
      clearTimeout(timer);
    }
    await this.lifecycle;
  }
}
