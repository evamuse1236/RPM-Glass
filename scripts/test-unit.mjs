import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const win = process.platform === 'win32';
const env = {...process.env};
if (!env.ANDROID_HOME && !existsSync('local.properties')) {
  const sdk = win ? join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : join(homedir(), 'Android', 'Sdk');
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
const gradle = win ? 'gradlew.bat' : './gradlew';
const run = spawnSync(gradle, ['-q', '--console=plain', ':app:testDebugUnitTest'], {stdio: 'inherit', env, shell: win});
if (run.status === 0) console.log('PASS: app unit tests (app/src/test)');
process.exit(run.status ?? 1);
