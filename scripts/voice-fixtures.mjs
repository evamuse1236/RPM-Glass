import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeWav} from '../android-companion/voice-fake-mic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'fixtures/voice');
const RATE = 16000;
const VOICE = process.env.RPM_VOICE_TTS_VOICE || 'en-US-JennyNeural';

function phraseFor(raw) {
  if (raw.phrase) return raw.phrase;
  const corpus = JSON.parse(fs.readFileSync(path.join(root, raw.source.corpus), 'utf8'));
  const item = corpus.find(row => row.id === raw.source.id);
  const text = item.turns.map(turn => turn.text).join('\n');
  fs.writeFileSync(path.join(dir, raw.phraseFile), text);
  return text;
}

function which(bin) {
  const found = spawnSync('which', [bin], {encoding: 'utf8'});
  return found.status === 0 ? found.stdout.trim() : '';
}

function tone(phrase) {
  const words = phrase.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(1, words / 2.5);
  const count = Math.round(seconds * RATE);
  const samples = new Float32Array(count);
  const syllable = Math.round(RATE * 0.12);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    const gate = (i % syllable) < syllable * 0.7 ? 1 : 0;
    const edge = Math.min(1, t * 30) * Math.min(1, (seconds - t) * 30);
    samples[i] = (Math.sin(2 * Math.PI * 140 * t) * 0.25 + Math.sin(2 * Math.PI * 700 * t) * 0.08) * gate * edge;
  }
  return samples;
}

function edgeSpeech(phrase, wavPath) {
  const edge = which('edge-tts');
  const ffmpeg = which('ffmpeg');
  if (!edge || !ffmpeg) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-voice-'));
  const mp3 = path.join(tmp, 'clip.mp3');
  const text = path.join(tmp, 'phrase.txt');
  fs.writeFileSync(text, phrase);
  const synth = spawnSync(edge, ['--voice', VOICE, '--file', text, '--write-media', mp3], {encoding: 'utf8'});
  if (synth.status !== 0) {
    fs.rmSync(tmp, {recursive: true, force: true});
    throw new Error(synth.stderr || synth.stdout || 'edge-tts failed');
  }
  const convert = spawnSync(ffmpeg, ['-y', '-i', mp3, '-ac', '1', '-ar', String(RATE), '-sample_fmt', 's16', wavPath], {encoding: 'utf8'});
  fs.rmSync(tmp, {recursive: true, force: true});
  if (convert.status !== 0) throw new Error(convert.stderr || 'ffmpeg failed');
  return 'edge-tts';
}

function durationMs(wavPath) {
  const buf = fs.readFileSync(wavPath);
  const rate = buf.readUInt32LE(24);
  const bytes = buf.readUInt32LE(40);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  const frames = bytes / (channels * (bits / 8));
  return Math.round(1000 * frames / rate);
}

for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.json'))) {
  const file = path.join(dir, name);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const phrase = phraseFor(raw);
  const wavPath = path.join(dir, `${raw.id}.wav`);
  let speech = edgeSpeech(phrase, wavPath);
  if (!speech) {
    const samples = tone(phrase);
    fs.writeFileSync(wavPath, encodeWav(samples, RATE));
    speech = 'tone-placeholder';
  }
  raw.durationMs = durationMs(wavPath);
  raw.speech = speech;
  if (speech === 'edge-tts') raw.tts = {engine: 'edge-tts', voice: VOICE};
  else delete raw.tts;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`${raw.id} ${raw.durationMs}ms ${speech} ${phrase.split(/\s+/).length} words`);
}
