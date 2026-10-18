import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const BUILT_WEB = 'app/src/main/assets/companion';
export const isWebSource = file => /^(android-companion|chat-prototype|intent-v2)\//.test(file);

export function builtWeb(root) {
  const dir = path.join(root, BUILT_WEB);
  if (!fs.existsSync(dir)) return {sha: null, at: 0};
  const hash = crypto.createHash('sha256');
  let at = 0;
  for (const file of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, file);
    hash.update(file).update('\0').update(fs.readFileSync(p));
    at = Math.max(at, fs.statSync(p).mtimeMs);
  }
  return {sha: hash.digest('hex'), at};
}
