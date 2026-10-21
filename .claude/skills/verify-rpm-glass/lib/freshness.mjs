import fs from 'node:fs';
import path from 'node:path';

export const NATIVE_SOURCES = ['app/src/main', 'app/build.gradle', 'cli'];
export const WEB_SOURCES = ['android-companion', 'chat-prototype', 'intent-v2/src', 'intent-v2/adapters', 'intent-v2/prompts'];
const SKIP = new Set(['node_modules', 'build', 'experiments', '.gradle', 'companion']);

export function newestFile(root, sources) {
  let newest = {mtime: 0, file: null};
  const walk = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (!SKIP.has(f)) walk(path.join(p, f)); }
    else if (!/\.test\.(mjs|ts)$/.test(p) && st.mtimeMs > newest.mtime) newest = {mtime: st.mtimeMs, file: path.relative(root, p)};
  };
  for (const s of sources) if (fs.existsSync(path.join(root, s))) walk(path.join(root, s));
  return newest;
}

/** Why the app on the emulator is not this checkout's code, or null when it is: a scenario on a stale app proves nothing. */
export function staleApp({apk, installedSha, syncedAt, native, web}) {
  if (!apk) return {error: 'There is no debug APK in this checkout.', fix: 'Run `rpmctl launch --build`.'};
  if (installedSha !== apk.sha) return {error: 'The emulator runs a different APK than this checkout built.', fix: 'Run `rpmctl launch` to install this build.'};
  if (native.mtime > apk.mtime) return {error: `Native code changed after the APK was built (${native.file}).`, fix: 'Run `rpmctl launch --build`.'};
  if (web.mtime > Math.max(apk.mtime, syncedAt ?? 0)) return {error: `Web code changed after the last install or sync (${web.file}).`, fix: 'Run `rpmctl sync` (seconds, no APK build).'};
  return null;
}
