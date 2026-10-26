// Import first. Convex deploys "use node" actions only from Node 20, 22 or 24, so rerun this script on Node 24.
import {spawnSync} from 'node:child_process';

if (![20, 22, 24].includes(Number(process.versions.node.split('.')[0])) && !process.env.RPM_NODE24_RERUN) {
  const result = spawnSync('mise', ['exec', 'node@24.22.0', '--', 'node', ...process.execArgv, ...process.argv.slice(1)],
    {stdio: 'inherit', env: {...process.env, RPM_NODE24_RERUN: '1'}});
  process.exit(result.error ? 1 : result.status ?? 1);
}
