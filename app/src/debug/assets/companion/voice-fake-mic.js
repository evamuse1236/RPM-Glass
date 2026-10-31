/** Debug-only stand-in for the mic. Release packaging must not include this file. */
export const FAKE_MIC_TOKEN = 'rpm-fake-mic-debug';

const text = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

export function encodeWav(samples, sampleRate = 16000) {
  const data = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data[i] = Math.max(-0x8000, Math.min(0x7fff, Math.round(v * 0x8000)));
  }
  const payload = data.length * 2;
  const out = new Uint8Array(44 + payload);
  const view = new DataView(out.buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) out[offset + i] = value.charCodeAt(i); };
  write(0, 'RIFF'); view.setUint32(4, 36 + payload, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, payload, true);
  out.set(new Uint8Array(data.buffer, data.byteOffset, payload), 44);
  return out;
}

export function parseWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WAVE') throw new Error('Not a WAV file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12, rate = 16000, channels = 1, bits = 16, dataAt = 0, dataLen = 0;
  while (offset + 8 <= bytes.length) {
    const id = text(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataAt = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!dataLen || bits !== 16) throw new Error('WAV must be 16-bit PCM');
  const count = Math.floor(dataLen / 2 / channels);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(dataAt + i * channels * 2, true) / 0x8000;
  return {sampleRate: rate, channels, samples};
}

function decodeBase64(value) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function wavBytes(spec) {
  if (spec instanceof Uint8Array) return spec;
  if (spec?.bytes instanceof Uint8Array) return spec.bytes;
  if (typeof spec?.base64 === 'string') return decodeBase64(spec.base64);
  const error = new Error('The microphone did not start. Close other apps that use it, then try again.');
  error.name = 'NotReadableError';
  throw error;
}

/** Posts worklet-sized frames at the audio clock. `later` is `setTimeout` on the device path. */
export function scheduleFrames({samples, sampleRate = 16000, quantum = 128, post, later = setTimeout, now = () => performance.now()}) {
  const started = now();
  let index = 0, frames = 0;
  return new Promise(resolve => {
    const tick = () => {
      if (index >= samples.length) {
        resolve({frames, durationMs: samples.length / sampleRate * 1000, elapsedMs: now() - started});
        return;
      }
      const end = Math.min(samples.length, index + quantum);
      const frame = new Float32Array(end - index);
      frame.set(samples.subarray(index, end));
      post(frame);
      frames += 1;
      index = end;
      const due = started + (index / sampleRate) * 1000;
      later(tick, Math.max(0, due - now()));
    };
    tick();
  });
}

const markSpeechEnd = n => { try { globalThis.performance?.mark?.(`voice:speechEnd#${n}`); } catch { /* mark API optional */ } };

/**
 * Posts worklet-sized frames at the audio clock from a queue of clips, with silence between them, until stopped:
 * the open line hears clip 1, quiet, then clip 2 in one session. `onClipEnd(n)` fires as clip n's last frame goes out.
 */
export function streamFrames({clips, sampleRate = 16000, quantum = 128, post, stopped, onClipEnd = () => {}, later = setTimeout, now = () => performance.now()}) {
  const started = now(), silence = new Float32Array(quantum);
  let sent = 0, clip = null, index = 0, played = 0;
  const tick = () => {
    if (stopped()) return;
    if (!clip && clips.length) { clip = clips.shift(); index = 0; }
    if (clip) {
      const end = Math.min(clip.length, index + quantum);
      const frame = new Float32Array(end - index);
      frame.set(clip.subarray(index, end));
      post(frame);
      sent += frame.length;
      index = end;
      if (index >= clip.length) { clip = null; onClipEnd(++played); }
    } else {
      post(silence.slice());
      sent += quantum;
    }
    later(tick, Math.max(0, started + (sent / sampleRate) * 1000 - now()));
  };
  tick();
}

/**
 * A mic the existing worklet can read. When the context can expose a media stream, the WAV plays
 * through that graph at its own sample clock, and the stream stays open as silence. Otherwise frames are
 * posted in worklet quanta. `play(spec)` (also `globalThis.__rpmFakeMicPlay`) speaks another clip later.
 */
export async function openFakeMic(spec, {AudioContextImpl = globalThis.AudioContext, later, now} = {}) {
  const pcm = parseWav(wavBytes(spec));
  const durationMs = pcm.samples.length / pcm.sampleRate * 1000;
  let clips = 0;
  if (typeof AudioContextImpl === 'function') {
    const ctx = new AudioContextImpl({sampleRate: pcm.sampleRate});
    if (typeof ctx.createMediaStreamDestination === 'function' && typeof ctx.createBuffer === 'function') {
      const dest = ctx.createMediaStreamDestination();
      const sources = new Set();
      const speak = clip => {
        const buffer = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
        buffer.copyToChannel?.(clip.samples, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        const n = ++clips;
        source.onended = () => { sources.delete(source); markSpeechEnd(n); };
        sources.add(source);
        source.start();
        return n;
      };
      speak(pcm);
      const stream = dest.stream;
      stream.durationMs = durationMs;
      stream.play = next => speak(parseWav(wavBytes(next)));
      stream.__rpmStop = () => {
        for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
        sources.clear();
        ctx.close?.();
        if (globalThis.__rpmFakeMicPlay === stream.play) delete globalThis.__rpmFakeMicPlay;
      };
      globalThis.__rpmFakeMicPlay = stream.play;
      return stream;
    }
    ctx.close?.();
  }
  const queue = [pcm.samples];
  const stream = {
    durationMs,
    stopped: false,
    getTracks() { return [{stop: () => { stream.stopped = true; }}]; },
    play(next) { queue.push(parseWav(wavBytes(next)).samples); return clips + queue.length; },
    feed(port) {
      streamFrames({
        clips: queue,
        sampleRate: pcm.sampleRate,
        later,
        now,
        stopped: () => stream.stopped,
        onClipEnd: n => { clips = n; markSpeechEnd(n); },
        post: frame => port.onmessage?.({data: frame}),
      });
    },
  };
  return stream;
}
