import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
export const siteDir = () => path.resolve(process.env.RPM_SITE_DIR || '/home/dararch/sites/rpm-planner');
export const SITE_INPUTS = ['web/', 'android-companion/', 'chat-prototype/', 'cli/', 'intent-v2/', 'scripts/build-companion-assets.mjs', 'package.json', 'package-lock.json'];
export const isSiteSource = file => SITE_INPUTS.some(input => input.endsWith('/') ? file.startsWith(input) : file === input);
export const publicationMessage = 'Website changes are merged but not published: run npm run web:stage, deploy through the Sites plugin, then npm run web:published';
export function readReceipt(root, name) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.verify', name), 'utf8')); } catch { return null; }
}
export function writeReceipt(root, name, receipt) {
  fs.mkdirSync(path.join(root, '.verify'), {recursive: true});
  fs.writeFileSync(path.join(root, '.verify', name), JSON.stringify(receipt, null, 2) + '\n');
}
export function assertCleanSources(root) {
  if (git(root, 'status', '--porcelain', '--untracked-files=all', '--', ...SITE_INPUTS))
    throw new Error('Cannot stage Site: RPM-Glass has uncommitted changes under web/ or android-companion/ or shared Site build inputs. Commit or stash them first.');
}
// Staging and publication use the same conservative Site input set.
export function siteSourcesMatch(root, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) return false;
  try {
    git(root, 'merge-base', '--is-ancestor', revision, 'HEAD');
    return !git(root, 'diff', '--name-only', '--no-renames', '-z', revision, 'HEAD').split('\0').some(isSiteSource);
  } catch { return false; }
}
const logSharedByWorktrees = root => path.resolve(root, git(root, 'rev-parse', '--git-common-dir'), 'rpm-site-published.json');
const complete = marker => /^[a-f0-9]{40}$/.test(marker?.rpmGlassSha ?? '') && marker.siteCommit && marker.deploymentId && marker.at;
export function publishedRecords(root) {
  let shared = [];
  try { shared = JSON.parse(fs.readFileSync(logSharedByWorktrees(root), 'utf8')); } catch {}
  return [...Array.isArray(shared) ? shared : [], readReceipt(root, 'site-published.json')].filter(complete);
}
export function recordPublication(root, receipt) {
  fs.writeFileSync(logSharedByWorktrees(root), JSON.stringify([...publishedRecords(root).filter(r => r.deploymentId !== receipt.deploymentId), receipt].slice(-50), null, 2) + '\n');
  writeReceipt(root, 'site-published.json', receipt);
}
export function sitePublicationGap(root) {
  if (git(root, 'branch', '--show-current') !== 'main') return null;
  return publishedRecords(root).some(marker => siteSourcesMatch(root, marker.rpmGlassSha)) ? null : publicationMessage;
}
