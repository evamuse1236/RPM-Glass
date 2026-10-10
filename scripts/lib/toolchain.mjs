// Finds the JDK, Android SDK and runs child commands the same way from PowerShell, cmd and Git Bash.
// On Windows `bash` on PATH is often WSL's, which has no JDK, so repo scripts call tools directly from Node instead.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const win = process.platform === 'win32';
const exe = name => win ? name + '.exe' : name;

// A JDK 17 or newer. JAVA_HOME wins, then a repo-local JDK in .tooling/, then java/javac on PATH.
// JDK 21 works: the Java sources target 17 and Gradle 8.13 / AGP 8.13 run on 17 through 21 (measured with 21.0.12).
export function findJdk() {
  const homes = [];
  if (process.env.JAVA_HOME) homes.push({home: process.env.JAVA_HOME.replace(/[\\/]+$/, ''), from: 'JAVA_HOME'});
  const tooling = path.join(ROOT, '.tooling');
  if (fs.existsSync(tooling)) for (const d of fs.readdirSync(tooling).filter(d => /^jdk-/.test(d)).sort().reverse())
    homes.push({home: path.join(tooling, d), from: '.tooling'});
  for (const {home, from} of homes) {
    const javac = path.join(home, 'bin', exe('javac'));
    if (fs.existsSync(javac)) return withVersion({home, from, javac, java: path.join(home, 'bin', exe('java'))});
  }
  const probe = spawnSync(exe('javac'), ['-version'], {encoding: 'utf8'});
  if (probe.status === 0) return withVersion({home: null, from: 'PATH', javac: exe('javac'), java: exe('java')});
  return null;
}

function withVersion(jdk) {
  const r = spawnSync(jdk.javac, ['-version'], {encoding: 'utf8'});
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const major = Number(text.match(/javac (\d+)/)?.[1] ?? 0);
  return {...jdk, version: text, major};
}

export const JDK_HELP = 'Install a JDK 17 or newer (CI uses Temurin 17; 21 also works), e.g. `winget install Microsoft.OpenJDK.21`, '
  + 'then set JAVA_HOME to its folder or put its bin/ on PATH.';

export function requireJdk() {
  const jdk = findJdk();
  if (!jdk) fail(`No JDK found (checked JAVA_HOME, .tooling/jdk-*, javac on PATH). ${JDK_HELP}`);
  if (jdk.major < 17) fail(`JDK ${jdk.major} found via ${jdk.from} (${jdk.javac}); the build needs 17 or newer. ${JDK_HELP}`);
  return jdk;
}

// The Android SDK Gradle will use: local.properties sdk.dir, then ANDROID_HOME / ANDROID_SDK_ROOT, then the default install.
export function findAndroidSdk() {
  const props = path.join(ROOT, 'local.properties');
  const fromProps = fs.existsSync(props) ? fs.readFileSync(props, 'utf8').match(/^sdk\.dir=(.*)$/m)?.[1]?.trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\') : null;
  const candidates = [[fromProps, 'local.properties sdk.dir'], [process.env.ANDROID_HOME, 'ANDROID_HOME'], [process.env.ANDROID_SDK_ROOT, 'ANDROID_SDK_ROOT'],
    [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'), 'default location'],
    [process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk'), 'default location']];
  for (const [dir, from] of candidates) if (dir && fs.existsSync(dir)) {
    return {dir, from, platform36: fs.existsSync(path.join(dir, 'platforms', 'android-36')), buildTools: fs.existsSync(path.join(dir, 'build-tools', '36.0.0'))};
  }
  return null;
}

export const SDK_HELP = 'Install Android Studio or the command-line tools, then `sdkmanager "platforms;android-36" "build-tools;36.0.0"`, '
  + 'and set ANDROID_HOME (or sdk.dir=... in the ignored local.properties).';

// Runs a command with inherited output. .bat/.cmd launchers (gradlew.bat, npm.cmd) need a shell on Windows.
export function run(cmd, args, options = {}) {
  const shell = win && /\.(bat|cmd)$/i.test(cmd);
  // Quote only what has spaces: cmd.exe resolves %~dp0 of a quoted bare name ("npm.cmd") to the current folder.
  const q = a => /\s/.test(a) ? `"${a}"` : a;
  const quoted = shell ? [q(cmd), ...args.map(q)] : null;
  const r = shell
    ? spawnSync(quoted.join(' '), {cwd: ROOT, stdio: 'inherit', shell: true, ...options})
    : spawnSync(cmd, args, {cwd: ROOT, stdio: 'inherit', ...options});
  if (r.error) throw r.error;
  return r.status ?? 1;
}

export const npmCmd = win ? 'npm.cmd' : 'npm';

export function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
