import {assertCleanSources, git, readReceipt, recordPublication, siteDir} from './publication.mjs';

try {
  const deploymentId = process.argv[2]?.trim();
  if (!deploymentId || process.argv.length !== 3) throw new Error('Usage: npm run web:published -- <deployment-id> (only after a successful Sites plugin deploy)');
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
  assertCleanSources(root);
  const staged = readReceipt(root, 'site-staged.json');
  if (!staged || staged.rpmGlassSha !== git(root, 'rev-parse', 'HEAD') || staged.siteCommit !== git(siteDir(), 'rev-parse', 'HEAD')
    || git(siteDir(), 'status', '--porcelain', '--untracked-files=all'))
    throw new Error('Staged source no longer matches HEAD or the Site repo. Run npm run web:stage and deploy that commit before marking it published.');
  recordPublication(root, {...staged, deploymentId, at: new Date().toISOString()});
  console.log(`Recorded Site deployment ${deploymentId} for RPM-Glass ${staged.rpmGlassSha}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
