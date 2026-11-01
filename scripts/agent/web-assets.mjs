import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const BUILT_WEB = 'app/src/main/assets/companion';
export const isWebSource = file => /^(android-companion|chat-prototype|intent-v2)\//.test(file);

const webSha = files => {
  const hash = crypto.createHash('sha256');
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) hash.update(name).update('\0').update(bytes);
  return hash.digest('hex');
};

export function builtWeb(root) {
  const dir = path.join(root, BUILT_WEB);
  if (!fs.existsSync(dir)) return {sha: null, at: 0};
  const files = new Map();
  let at = 0;
  for (const file of fs.readdirSync(dir)) {
    const p = path.join(dir, file);
    files.set(file, fs.readFileSync(p));
    at = Math.max(at, fs.statSync(p).mtimeMs);
  }
  return {sha: webSha(files), at};
}

// The same hash as builtWeb, read from the web assets packed in an APK (a zip).
export function apkWebSha(apk) {
  const end = apk.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) return null;
  const files = new Map();
  for (let i = 0, at = apk.readUInt32LE(end + 16); i < apk.readUInt16LE(end + 10); i++) {
    const method = apk.readUInt16LE(at + 10), size = apk.readUInt32LE(at + 20), nameLength = apk.readUInt16LE(at + 28);
    const name = apk.toString('utf8', at + 46, at + 46 + nameLength), local = apk.readUInt32LE(at + 42);
    at += 46 + nameLength + apk.readUInt16LE(at + 30) + apk.readUInt16LE(at + 32);
    const file = name.match(/^assets\/companion\/([^/]+)$/)?.[1];
    if (!file) continue;
    const start = local + 30 + apk.readUInt16LE(local + 26) + apk.readUInt16LE(local + 28), data = apk.subarray(start, start + size);
    files.set(file, method === 8 ? zlib.inflateRawSync(data) : data);
  }
  return files.size ? webSha(files) : null;
}
