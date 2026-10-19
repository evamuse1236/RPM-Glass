import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {scenarioArgs} from './scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const command = (bin, args, {allowFail = false, inherit = false} = {}) => {
  const out = spawnSync(bin, args, {cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', windowsHide: true});
  if (out.error) throw out.error;
  if (out.status !== 0 && !allowFail) throw new Error(out.stderr?.trim() || `${bin} ${args[0]} failed (${out.status}).`);
  return out;
};
const git = (...args) => command('git', args).stdout.trim();
const gh = (...args) => command('gh', args).stdout.trim();

export function selectRun(runs, {branch, sha, request}) {
  return runs.find(r => r.headBranch === branch && r.headSha === sha && r.displayTitle === `RPM emulator ${request}` && r.event === 'workflow_dispatch');
}

async function main() {
  const scenarios = scenarioArgs(process.argv.slice(2).join(' ') || '--all').join(' ');
  const branch = git('branch', '--show-current'), sha = git('rev-parse', 'HEAD');
  if (!branch) throw new Error('Check out a branch and push it to origin before running ci:emulator.');
  const remote = command('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], {allowFail: true});
  if (remote.status !== 0 || remote.stdout.trim().split(/\s+/)[0] !== sha)
    throw new Error(`Push ${branch} to origin first: git push -u origin ${branch}`);
  if (git('status', '--porcelain', '--untracked-files=no'))
    throw new Error('Commit and push your tracked changes first. GitHub tests the pushed commit.');
  const repo = JSON.parse(gh('repo', 'view', '--json', 'nameWithOwner')).nameWithOwner;
  const workflows = JSON.parse(gh('api', `repos/${repo}/actions/workflows`)).workflows;
  const workflow = workflows.find(w => w.path === '.github/workflows/emulator.yml');
  if (!workflow) throw new Error('emulator.yml is not registered on GitHub yet. Run it once from a pull request or a branch push trigger, then retry.');
  const request = randomUUID();
  gh('workflow', 'run', String(workflow.id), '--repo', repo, '--ref', branch, '-f', `scenarios=${scenarios}`, '-f', `request_id=${request}`);
  console.log(`Dispatched ${branch} at ${sha.slice(0, 7)}. Waiting for GitHub to register the run.`);
  let run;
  const deadline = Date.now() + 120000;
  while (!run && Date.now() < deadline) {
    const runs = JSON.parse(gh('run', 'list', '--repo', repo, '--workflow', String(workflow.id), '--branch', branch, '--event', 'workflow_dispatch', '--limit', '50', '--json', 'databaseId,headBranch,headSha,displayTitle,event'));
    run = selectRun(runs, {branch, sha, request});
    if (!run) await pause(5000);
  }
  if (!run) throw new Error(`GitHub has not listed request ${request}. Check gh run list before dispatching again.`);
  const url = `https://github.com/${repo}/actions/runs/${run.databaseId}`;
  console.log(url);
  command('gh', ['run', 'watch', String(run.databaseId), '--repo', repo, '--exit-status', '--interval', '15'], {allowFail: true, inherit: true});
  const finished = JSON.parse(gh('run', 'view', String(run.databaseId), '--repo', repo, '--json', 'status,conclusion,createdAt,updatedAt,url'));
  const destination = path.join(root, '.verify/evidence', `ci-${run.databaseId}`);
  fs.mkdirSync(destination, {recursive: true});
  fs.writeFileSync(path.join(destination, 'run.json'), JSON.stringify({...finished, branch, sha}, null, 2));
  const download = command('gh', ['run', 'download', String(run.databaseId), '--repo', repo, '--dir', destination], {allowFail: true});
  console.log(`${finished.conclusion || finished.status}: ${finished.url}`);
  console.log(`Artifacts: ${destination}`);
  if (download.status !== 0) console.error(`Artifact download failed: ${download.stderr?.trim()}`);
  process.exitCode = finished.status === 'completed' && finished.conclusion === 'success' && download.status === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
