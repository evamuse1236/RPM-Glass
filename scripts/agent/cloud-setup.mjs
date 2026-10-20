// SessionStart hook. In a cloud session only: installs the Android SDK pieces the build needs, sets ANDROID_HOME,
// adds the cloud Gradle settings and tells the agent how proof works without an emulator. Elsewhere it does nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLOUD_RULES, isCloud, missingPackages, sdkHome, writeGradleProperties} from './cloud.mjs';

const env = process.env;
if (!isCloud(env)) process.exit(0);

const started = Date.now();
const DEADLINE_MS = 9 * 60 * 1000;
const left = () => Math.max(10_000, DEADLINE_MS - (Date.now() - started));
const project = env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = sdkHome(env);
const log = [];
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: left(), maxBuffer: 64 * 1024 * 1024, ...options});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim().slice(-600)}`);
  return r.stdout;
};

function cmdlineToolsZip() {
  try {
    const xml = run('curl', ['-fsSL', '--retry', '5', 'https://dl.google.com/android/repository/repository2-3.xml']);
    const block = xml.slice(xml.indexOf('remotePackage path="cmdline-tools;latest"'));
    return block.match(/commandlinetools-linux-\d+_latest\.zip/)?.[0] ?? 'commandlinetools-linux-16111833_latest.zip';
  } catch { return 'commandlinetools-linux-16111833_latest.zip'; }
}

function sdkmanager() {
  const bin = path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
  if (fs.existsSync(bin)) return bin;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-sdk-'));
  const zip = path.join(tmp, 'tools.zip');
  run('curl', ['-fsSL', '--retry', '5', '-o', zip, `https://dl.google.com/android/repository/${cmdlineToolsZip()}`]);
  run('python3', ['-m', 'zipfile', '-e', zip, tmp]);
  fs.mkdirSync(path.join(sdk, 'cmdline-tools'), {recursive: true});
  fs.rmSync(path.join(sdk, 'cmdline-tools', 'latest'), {recursive: true, force: true});
  fs.renameSync(path.join(tmp, 'cmdline-tools'), path.join(sdk, 'cmdline-tools', 'latest'));
  for (const file of fs.readdirSync(path.join(sdk, 'cmdline-tools', 'latest', 'bin'))) fs.chmodSync(path.join(sdk, 'cmdline-tools', 'latest', 'bin', file), 0o755);
  fs.rmSync(tmp, {recursive: true, force: true});
  log.push('installed cmdline-tools');
  return bin;
}

let problem = null;
try {
  const missing = missingPackages(sdk);
  if (missing.length) {
    const manager = sdkmanager();
    const yes = 'y\n'.repeat(60);
    run(manager, [`--sdk_root=${sdk}`, '--licenses'], {input: yes});
    run(manager, [`--sdk_root=${sdk}`, ...missing], {input: yes});
    log.push(`installed ${missing.join(', ')}`);
  } else log.push('Android SDK already present');
} catch (error) { problem = error.message; }

const gradle = writeGradleProperties(env);
if (env.CLAUDE_ENV_FILE) fs.appendFileSync(env.CLAUDE_ENV_FILE, `export ANDROID_HOME="${sdk}"\nexport ANDROID_SDK_ROOT="${sdk}"\nexport PATH="${sdk}/platform-tools:$PATH"\n`);
const localProperties = path.join(project, 'local.properties');
if (!fs.existsSync(localProperties)) fs.writeFileSync(localProperties, `sdk.dir=${sdk}\n`);

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`${CLOUD_RULES}\nAndroid setup (${seconds} s): ${problem ? `FAILED: ${problem}` : log.join('; ')}. ANDROID_HOME=${sdk}. Gradle cloud settings: ${gradle}.`);
