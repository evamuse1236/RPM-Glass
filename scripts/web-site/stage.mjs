import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {assertCleanSources, git, siteDir, writeReceipt} from './publication.mjs';

try {
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
  assertCleanSources(root);
  const site = siteDir();
  if (git(site, 'status', '--porcelain', '--untracked-files=all')) throw new Error('Cannot stage Site: the Site repo has uncommitted changes.');
  const rpmGlassSha = git(root, 'rev-parse', 'HEAD');
  const short = git(root, 'rev-parse', '--short', 'HEAD');
  const env = {...process.env};
  delete env.RPM_SYNC_SERVER;
  execFileSync(process.execPath, ['web/build.mjs'], {cwd: root, env, stdio: 'inherit'});
  const target = path.join(site, 'dist/server/index.js');
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, 'web/dist-site/server/index.js'), target);
  git(site, 'add', '--', 'dist/server/index.js');
  // Even an identical bundle records the RPM revision the deploy agent will publish.
  git(site, 'commit', '--allow-empty', '-m', `Update Site source: ${git(root, 'log', '-1', '--format=%s')} (RPM-Glass ${short})`);
  const siteCommit = git(site, 'rev-parse', 'HEAD');
  writeReceipt(root, 'site-staged.json', {rpmGlassSha, siteCommit});
  console.log(`Staged ${siteCommit} in ${site}. Next: deploy through the Sites plugin, then run npm run web:published -- <deployment-id>.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
