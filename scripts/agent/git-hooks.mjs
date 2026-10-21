import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const MARK = 'rpm-merge-scenarios';
const COMMAND = 'node scripts/agent/require-evidence.mjs --merge';
const EVENTS = ['pre-merge-commit', 'pre-commit'];
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

// Older git ignores hook.<name>.event (2.43 in the cloud does; 2.56 runs it), so try one in a scratch repo.
export function configHooksWork() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-hook-probe-'));
  try {
    git(dir, 'init', '-q');
    git(dir, 'config', 'hook.probe.event', 'pre-commit');
    git(dir, 'config', 'hook.probe.command', 'echo ran > probe-ran');
    git(dir, '-c', 'user.name=probe', '-c', 'user.email=probe@example.com', 'commit', '-q', '--allow-empty', '-m', 'probe');
    return fs.existsSync(path.join(dir, 'probe-ran'));
  } catch { return false; } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

export function installMergeCheck(root, {configHooks = configHooksWork()} = {}) {
  if (configHooks) {
    git(root, 'config', '--replace-all', `hook.${MARK}.event`, EVENTS[0]);
    git(root, 'config', '--add', `hook.${MARK}.event`, EVENTS[1]);
    git(root, 'config', '--replace-all', `hook.${MARK}.command`, COMMAND);
    return {mode: 'config', written: EVENTS, skipped: []};
  }
  const dir = path.resolve(root, git(root, 'rev-parse', '--git-path', 'hooks'));
  fs.mkdirSync(dir, {recursive: true});
  const written = [], skipped = [];
  for (const event of EVENTS) {
    const file = path.join(dir, event);
    if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(MARK)) { skipped.push(file); continue; }
    fs.writeFileSync(file, `#!/bin/sh\n# ${MARK}\nexec ${COMMAND}\n`, {mode: 0o755});
    written.push(event);
  }
  return {mode: 'files', written, skipped};
}
