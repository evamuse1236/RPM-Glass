import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {UserError, sdkRoot} from './device.mjs';
import {ROOT, APK, viaShell} from './runtime.mjs';

const SOURCES = ['app/src/main', 'android-companion', 'chat-prototype', 'cli', 'intent-v2/src', 'intent-v2/adapters', 'intent-v2/prompts', 'scripts/build-companion-assets.mjs', 'app/build.gradle'];
export const gradleVersion = () => {
  const g = fs.readFileSync(path.join(ROOT, 'app/build.gradle'), 'utf8');
  return {versionName: g.match(/versionName "([^"]+)"/)?.[1], versionCode: g.match(/versionCode (\d+)/)?.[1]};
};
export function newestSource() {
  let newest = 0, file = null;
  const walk = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (!['node_modules', 'build', 'experiments', '.gradle', 'companion'].includes(f)) walk(path.join(p, f)); }
    else if (st.mtimeMs > newest) { newest = st.mtimeMs; file = p; }
  };
  for (const s of SOURCES) if (fs.existsSync(path.join(ROOT, s))) walk(path.join(ROOT, s));
  return {mtime: newest, file: file && path.relative(ROOT, file)};
}
export const apkStale = () => !fs.existsSync(APK) || fs.statSync(APK).mtimeMs < newestSource().mtime;

// SHA-256 of the APK's signing certificate, via the SDK's apksigner (needs Java on PATH or JAVA_HOME).
export function signer(apk) {
  const tools = path.join(sdkRoot(), 'build-tools');
  const latest = fs.existsSync(tools) ? fs.readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).at(-1) : null;
  if (!latest) return null;
  const bin = path.join(tools, latest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const r = spawnSync(...viaShell(bin, ['verify', '--print-certs', apk]), {encoding: 'utf8', windowsHide: true});
  return r.stdout?.match(/certificate SHA-256 digest: ([0-9a-f]+)/)?.[1] ?? null;
}

export function build() {
  const gradlew = path.join(ROOT, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const env = {...process.env, ANDROID_HOME: process.env.ANDROID_HOME || sdkRoot()};
  const r = spawnSync(...viaShell(gradlew, ['-q', 'assembleDebug']), {cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env});
  if (r.status !== 0) throw new UserError(`Gradle assembleDebug failed:\n${(r.stderr || r.stdout).trim().slice(-2000)}`, 'Fix the build error above, run `npm ci` if node_modules is missing, then `rpmctl launch --build`.');
  const now = new Date();
  if (fs.existsSync(APK)) fs.utimesSync(APK, now, now);
}
