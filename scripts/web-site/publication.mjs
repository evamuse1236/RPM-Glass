import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
export const siteDir = () => path.resolve(process.env.RPM_SITE_DIR || '/home/dararch/sites/rpm-planner');
export const isSiteSource = file => /^(web|android-companion)\//.test(file);
export const publicationMessage = 'Website changes are merged but not published: run npm run web:stage, deploy through the Sites plugin, then npm run web:published';
export function readReceipt(root, name) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.verify', name), 'utf8')); } catch { return null; }
}
export function writeReceipt(root, name, receipt) {
  fs.mkdirSync(path.join(root, '.verify'), {recursive: true});
  fs.writeFileSync(path.join(root, '.verify', name), JSON.stringify(receipt, null, 2) + '\n');
}
export function assertCleanSources(root) {
  if (git(root, 'status', '--porcelain', '--untracked-files=all', '--', 'web/', 'android-companion/'))
    throw new Error('Cannot stage Site: RPM-Glass has uncommitted changes under web/ or android-companion/. Commit or stash them first.');
}
export function sitePublicationGap(root) {
  if (git(root, 'branch', '--show-current') !== 'main') return null;
  const marker = readReceipt(root, 'site-published.json');
  try {
    if (!/^[a-f0-9]{40}$/.test(marker?.rpmGlassSha ?? '') || !marker.siteCommit || !marker.deploymentId || !marker.at)
      return publicationMessage;
    git(root, 'merge-base', '--is-ancestor', marker.rpmGlassSha, 'HEAD');
    const files = git(root, 'diff', '--name-only', '--no-renames', '-z', marker.rpmGlassSha, 'HEAD').split('\0');
    return files.some(isSiteSource) ? publicationMessage : null;
  } catch { return publicationMessage; }
}
