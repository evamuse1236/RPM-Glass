import {installMergeCheck} from './git-hooks.mjs';
const {mode, written, skipped} = installMergeCheck(process.cwd());
console.log(`Installed as ${mode === 'config' ? 'git config hooks' : 'hook files'} (${written.join(', ')}): a merge commit on main now needs a passing \`rpmctl scenario --all\` for incoming app changes.`);
for (const file of skipped) console.log(`Not installed: ${file} already exists. Add \`node scripts/agent/require-evidence.mjs --merge\` to it.`);
if (skipped.length) process.exitCode = 1;
