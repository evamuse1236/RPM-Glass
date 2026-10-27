import './node24.mjs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const main = join(dirname(createRequire(import.meta.url).resolve('convex/package.json')), 'bin/main.js');
const result = spawnSync(process.execPath, [main, ...process.argv.slice(2)],
  {cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit'});
process.exit(result.error ? 1 : result.status ?? 1);
