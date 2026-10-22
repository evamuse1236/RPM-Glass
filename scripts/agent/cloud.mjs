// What changes in a Claude Code cloud session: no KVM, so no emulator, and Maven Central answers 429 through the proxy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const isCloud = (env = process.env) => Boolean(env.CLAUDE_CODE_REMOTE_SESSION_ID);

export const SDK_PACKAGES = ['platform-tools', 'platforms;android-36', 'build-tools;35.0.0'];
export const sdkHome = (env = process.env, home = os.homedir()) => env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(home, 'android-sdk');
export const missingPackages = sdk => SDK_PACKAGES.filter(p => !fs.existsSync(path.join(sdk, ...p.split(';'))));

export const GRADLE_CLOUD = {
  'org.gradle.workers.max': '2',
  'org.gradle.parallel': 'false',
  'systemProp.org.gradle.internal.repository.max.retries': '10',
  'systemProp.org.gradle.internal.repository.initial.backoff': '2000',
  'systemProp.org.gradle.internal.http.connectionTimeout': '120000',
  'systemProp.org.gradle.internal.http.socketTimeout': '120000',
};

export function writeGradleProperties(env = process.env, home = os.homedir()) {
  if (!isCloud(env)) return null;
  const file = path.join(env.GRADLE_USER_HOME || path.join(home, '.gradle'), 'gradle.properties');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const set = new Set(text.split('\n').map(line => line.split('=')[0].trim()));
  const add = Object.entries(GRADLE_CLOUD).filter(([key]) => !set.has(key)).map(([key, value]) => `${key}=${value}`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (add.length) fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`);
  return file;
}

export const MAVEN_MIRROR = 'https://maven-central.storage-download.googleapis.com/maven2/';
export const MIRROR_PROBE = `${MAVEN_MIRROR}junit/junit/4.13.2/junit-4.13.2.pom`;
export const MIRROR_INIT = `def mirror = '${MAVEN_MIRROR}'
def useMirror = { repos -> repos.withType(MavenArtifactRepository).configureEach { repo -> if (repo.url.host == 'repo.maven.apache.org') repo.url = mirror } }
beforeSettings { settings ->
  useMirror(settings.pluginManagement.repositories)
  useMirror(settings.dependencyResolutionManagement.repositories)
}
`;

export function writeMavenMirror(env = process.env, home = os.homedir(), reachable = false) {
  if (!isCloud(env) || !reachable) return null;
  const file = path.join(env.GRADLE_USER_HOME || path.join(home, '.gradle'), 'init.d', 'rpm-maven-mirror.gradle');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, MIRROR_INIT);
  return file;
}

export const CLOUD_RULES = 'Cloud session: there is no emulator here (no KVM). Prove a web-only change with '
  + '`node scripts/agent/browser-shot.mjs <label> [planner.html|index.html]` and put the PNG path in the reply. '
  + 'Report a Java, notch or manifest change as UNVERIFIED: needs a PC emulator run.';
