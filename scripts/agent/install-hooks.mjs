import {execFileSync} from 'node:child_process';
const config = (...args) => execFileSync('git', ['config', ...args], {stdio: 'inherit'});
config('--replace-all', 'hook.rpm-merge-scenarios.event', 'pre-merge-commit');
config('--add', 'hook.rpm-merge-scenarios.event', 'pre-commit');
config('--replace-all', 'hook.rpm-merge-scenarios.command', 'node scripts/agent/require-evidence.mjs --merge');
console.log('Installed: a merge commit on main now needs a passing `rpmctl scenario --all` for incoming app changes.');
