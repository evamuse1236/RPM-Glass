import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {GRADLE_CLOUD, MAVEN_MIRROR, SDK_PACKAGES, writeGradleProperties, writeMavenMirror} from '../agent/cloud.mjs';
import {builtWeb} from '../agent/web-assets.mjs';

const here = path.resolve(import.meta.dirname, '..');
const CLOUD = {CLAUDE_CODE_REMOTE_SESSION_ID: 'session_test'};
const baseEnv = () => { const env = {...process.env}; delete env.CLAUDE_CODE_REMOTE_SESSION_ID; delete env.CLAUDE_ENV_FILE; return env; };
const temp = (t, prefix) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };

function repo(t) {
  const root = temp(t, 'rpm-cloud-');
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), text); };
  for (const file of ['require-evidence.mjs', 'cloud.mjs', 'web-assets.mjs']) write(`scripts/agent/${file}`, fs.readFileSync(path.join(here, 'agent', file)));
  write('.gitignore', '.verify/\n');
  write('android-companion/a.mjs', 'export const a = 1;\n');
  write('app/src/main/java/A.java', 'class A {}\n');
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feat/x');
  return {root, write};
}
function stopHook(root, env, input = {}) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/agent/require-evidence.mjs'), '--hook'], {cwd: root, env, input: JSON.stringify(input), encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}
function browserShot(root, meta = {}) {
  const dir = path.join(root, '.verify/evidence/browser-run');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, '01-today.png'), Buffer.alloc(2000, 1));
  fs.writeFileSync(path.join(dir, '01-today.json'), JSON.stringify({browser: true, webSha256: builtWeb(root).sha, pageErrors: [], ...meta}));
}

test('cloud: a web change needs a browser screenshot, not the emulator; off the cloud it still needs the emulator', t => {
  const {root, write} = repo(t);
  write('android-companion/a.mjs', 'export const a = 2;\n');
  const cloud = stopHook(root, {...baseEnv(), ...CLOUD});
  assert.equal(cloud.decision, 'block');
  assert.match(cloud.reason, /Cloud session: no browser screenshot.*browser-shot\.mjs/);
  assert.doesNotMatch(cloud.reason, /rpmctl/);
  assert.equal(cloud.systemMessage, undefined);
  const pc = stopHook(root, baseEnv());
  assert.equal(pc.decision, 'block');
  assert.match(pc.reason, /rpmctl/);
  assert.deepEqual(stopHook(root, {...baseEnv(), ...CLOUD}, {stop_hook_active: true}), {}, 'it blocks once per stop');
});

test('cloud: a browser screenshot newer than the web change lets the stop through; one with page errors does not', t => {
  const {root, write} = repo(t);
  write('android-companion/a.mjs', 'export const a = 2;\n');
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(root, 'android-companion/a.mjs'), old, old);
  browserShot(root, {pageErrors: ['TypeError: x is undefined']});
  assert.equal(stopHook(root, {...baseEnv(), ...CLOUD}).decision, 'block');
  browserShot(root);
  assert.deepEqual(stopHook(root, {...baseEnv(), ...CLOUD}), {});
  assert.equal(stopHook(root, baseEnv()).decision, 'block', 'a browser shot is not emulator proof on the PC');
});

test('cloud: a Java change is reported UNVERIFIED and the stop is allowed; off the cloud it needs an APK build', t => {
  const {root, write} = repo(t);
  write('app/src/main/java/A.java', 'class A { int b; }\n');
  const cloud = stopHook(root, {...baseEnv(), ...CLOUD});
  assert.equal(cloud.decision, undefined);
  assert.match(cloud.systemMessage, /^UNVERIFIED: native change \(app\/src\/main\/java\/A\.java\) needs a PC emulator run/);
  const pc = stopHook(root, baseEnv());
  assert.equal(pc.decision, 'block');
  assert.match(pc.reason, /Native change.*launch --build/);
});

test('cloud Gradle settings: fewer workers and more download retries, written only in a cloud session', t => {
  const home = temp(t, 'rpm-gradle-');
  assert.equal(writeGradleProperties(baseEnv(), home), null);
  assert.equal(fs.existsSync(path.join(home, '.gradle')), false);
  fs.mkdirSync(path.join(home, '.gradle'));
  fs.writeFileSync(path.join(home, '.gradle/gradle.properties'), 'org.gradle.workers.max=1');
  const file = writeGradleProperties({...CLOUD}, home);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^org\.gradle\.workers\.max=1$/m, 'a key the user already set stays');
  assert.match(text, /^systemProp\.org\.gradle\.internal\.repository\.max\.retries=10$/m);
  assert.equal(writeGradleProperties({...CLOUD}, home), file);
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'running it twice adds nothing');
  assert.equal(GRADLE_CLOUD['org.gradle.workers.max'], '2');
});

test('cloud Gradle fetches Maven Central from the Google mirror, only in a cloud session and only when the mirror answers', t => {
  const home = temp(t, 'rpm-mirror-');
  const file = path.join(home, '.gradle/init.d/rpm-maven-mirror.gradle');
  assert.equal(writeMavenMirror(baseEnv(), home, true), null);
  assert.equal(writeMavenMirror({...CLOUD}, home, false), null);
  assert.equal(fs.existsSync(file), false);
  assert.equal(writeMavenMirror({...CLOUD}, home, true), file);
  const script = fs.readFileSync(file, 'utf8');
  assert.match(script, /repo\.url\.host == 'repo\.maven\.apache\.org'.*repo\.url = mirror/);
  assert.ok(script.includes(MAVEN_MIRROR));
  assert.match(script, /pluginManagement\.repositories[\s\S]*dependencyResolutionManagement\.repositories/);
});

test('the SessionStart setup does nothing off the cloud; in the cloud it reuses an SDK that is present and sets ANDROID_HOME', t => {
  const dir = temp(t, 'rpm-setup-');
  const sdk = path.join(dir, 'sdk'), project = path.join(dir, 'project'), envFile = path.join(dir, 'env');
  fs.mkdirSync(project);
  const env = {...baseEnv(), RPM_MAVEN_MIRROR: 'off', HOME: dir, ANDROID_HOME: sdk, CLAUDE_PROJECT_DIR: project, CLAUDE_ENV_FILE: envFile, GRADLE_USER_HOME: path.join(dir, 'gradle')};
  const setup = extra => spawnSync(process.execPath, [path.join(here, 'agent/cloud-setup.mjs')], {env: {...env, ...extra}, encoding: 'utf8', timeout: 20_000});
  const off = setup({});
  assert.equal(off.status, 0);
  assert.equal(off.stdout, '');
  assert.equal(fs.existsSync(envFile) || fs.existsSync(path.join(project, 'local.properties')) || fs.existsSync(env.GRADLE_USER_HOME), false);
  for (const pkg of SDK_PACKAGES) fs.mkdirSync(path.join(sdk, ...pkg.split(';')), {recursive: true});
  const on = setup(CLOUD);
  assert.equal(on.status, 0, on.stderr);
  assert.match(on.stdout, /no emulator here.*UNVERIFIED: needs a PC emulator run/s);
  assert.match(on.stdout, /Android SDK already present/);
  assert.match(fs.readFileSync(envFile, 'utf8'), new RegExp(`export ANDROID_HOME="${sdk}"`));
  assert.equal(fs.readFileSync(path.join(project, 'local.properties'), 'utf8'), `sdk.dir=${sdk}\n`);
  assert.match(fs.readFileSync(path.join(env.GRADLE_USER_HOME, 'gradle.properties'), 'utf8'), /org\.gradle\.workers\.max=2/);
});

test('the cloud setup runs npm ci when a fresh checkout has no node_modules, so build-debug finds esbuild', {skip: process.platform === 'win32'}, t => {
  const dir = temp(t, 'rpm-setup-npm-');
  const sdk = path.join(dir, 'sdk'), project = path.join(dir, 'project'), npm = path.join(dir, 'npm');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'package-lock.json'), '{}');
  for (const pkg of SDK_PACKAGES) fs.mkdirSync(path.join(sdk, ...pkg.split(';')), {recursive: true});
  fs.writeFileSync(npm, '#!/bin/sh\necho "$@" > npm-args\nmkdir node_modules\n', {mode: 0o755});
  const env = {...baseEnv(), ...CLOUD, RPM_MAVEN_MIRROR: 'off', RPM_NPM: npm, HOME: dir, ANDROID_HOME: sdk, CLAUDE_PROJECT_DIR: project, GRADLE_USER_HOME: path.join(dir, 'gradle')};
  const setup = () => spawnSync(process.execPath, [path.join(here, 'agent/cloud-setup.mjs')], {env, encoding: 'utf8', timeout: 20_000});
  const first = setup();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Node packages: ran npm ci/);
  assert.equal(fs.readFileSync(path.join(project, 'npm-args'), 'utf8').trim(), 'ci --no-audit --no-fund');
  assert.match(setup().stdout, /Node packages: node_modules present/);
});

test('build-debug retries a Maven 429 with two workers in the cloud, and runs Gradle once as before elsewhere', {skip: process.platform === 'win32'}, t => {
  const dir = temp(t, 'rpm-build-');
  const calls = path.join(dir, 'calls'), gradlew = path.join(dir, 'gradlew');
  fs.writeFileSync(gradlew, `#!/usr/bin/env bash\necho "$*" >> "${calls}"\nn=$(wc -l < "${calls}")\nif [ "$n" -lt 3 ]; then echo "Could not GET 'https://repo.maven.apache.org/x.pom'. Received status code 429 from server: Too Many Requests"; exit 1; fi\necho BUILD SUCCESSFUL\n`, {mode: 0o755});
  const build = extra => spawnSync('bash', [path.join(here, 'build-debug.sh')], {env: {...baseEnv(), GRADLEW: gradlew, RETRY_SECONDS: '0', ...extra}, encoding: 'utf8'});
  const cloud = build(CLOUD);
  assert.equal(cloud.status, 0, cloud.stderr);
  const lines = fs.readFileSync(calls, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines.every(line => line.includes('--max-workers=2')));
  fs.rmSync(calls);
  const pc = build({});
  assert.equal(pc.status, 1);
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), ['--no-daemon assembleDebug lintDebug assembleDebugAndroidTest']);
});
