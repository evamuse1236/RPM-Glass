import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const CAPTURE_PIPELINE_SOURCES = [
  /^intent-v2\//,
  /^cli\/interpret\.mjs$/,
  /^android-companion\/intent-[^/]*\.mjs$/,
  /^android-companion\/(capture-agent|runtime)\.mjs$/,
  /^app\/src\/main\/java\/com\/rpm\/prototype\/Model[^/]*\.java$/,
];
const isPipeline = file => CAPTURE_PIPELINE_SOURCES.some(pattern => pattern.test(file));
const git = (root, ...args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
const listed = text => text.split('\0').filter(Boolean);
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const indexFile = root => path.join(root, '.verify/capture-stress-index.json');

export function captureSourceHash(root) {
  const hash = createHash('sha256');
  const files = listed(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'));
  for (const file of [...new Set(files)].filter(isPipeline).sort()) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    hash.update(file); hash.update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}

export function recordCaptureRun(root, directory) {
  const file = indexFile(root);
  const previous = readJson(file);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify([...new Set([...(Array.isArray(previous) ? previous : []), path.resolve(directory)])], null, 2));
}

export function captureEvalEvidence(root) {
  const forkPoint = git(root, 'merge-base', 'main', 'HEAD').trim();
  const changed = listed(git(root, 'diff', '--name-only', '--no-renames', '-z', forkPoint));
  changed.push(...listed(git(root, 'ls-files', '-z', '--others', '--exclude-standard')));
  if (!changed.some(isPipeline)) return {gap: null};
  const ids = readJson(path.join(root, 'scripts/capture-stress/corpus/real-2026-10-27.json'))?.map(c => c.id).filter(id => id.startsWith('real-'));
  if (!ids?.length) return {gap: 'Capture pipeline changed: real-phrase corpus is missing or empty.'};
  const hash = captureSourceHash(root), base = path.join(root, '.verify/capture-stress');
  const indexed = readJson(indexFile(root));
  const directories = [...(fs.existsSync(base) ? fs.readdirSync(base).map(name => path.join(base, name)) : []),
    ...(Array.isArray(indexed) ? indexed.filter(d => typeof d === 'string').map(d => path.resolve(root, d)) : [])];
  const matches = [];
  for (const directory of new Set(directories)) {
    const run = readJson(path.join(directory, 'results.json'));
    if (run?.sourceHash !== hash || run.sourceStable !== true || (run.transport ?? run.options?.transport) !== 'api' || !Array.isArray(run.results)) continue;
    const real = run.results.filter(r => ids.includes(r.id));
    if (ids.every(id => real.some(r => r.id === id && typeof r.pass === 'boolean'))) matches.push({directory, real});
  }
  matches.sort((a, b) => fs.statSync(path.join(b.directory, 'results.json')).mtimeMs - fs.statSync(path.join(a.directory, 'results.json')).mtimeMs);
  if (matches.length) {
    const {directory, real} = matches[0];
    return {gap: null, report: `Capture live eval: ${real.filter(r => r.pass === true).length}/${real.length} real-corpus case-runs passed (${directory}). Report this score; acceptance does not depend on it.`};
  }
  return {gap: `Capture pipeline changed: run the live eval (secret run --env ANTHROPIC_API_KEY=anthropic -- npm run stress:capture -- --transport api --only ${ids.join(',')} --repeat 3)`};
}
