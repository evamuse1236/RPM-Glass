import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const PHONE_SIGNER = '02620d8ae0ca0622e0d29f7a21086d89a3f4e29956a825972ccd739b97788db2';

export function signerDigest(apksignerOutput) {
  return /certificate SHA-256 digest: ([0-9a-f]{64})/.exec(apksignerOutput)?.[1] ?? null;
}

function apksigner() {
  const tools = path.join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '', 'build-tools');
  const latest = fs.readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})).at(-1);
  return path.join(tools, latest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apk = process.argv[2];
  const run = spawnSync(apksigner(), ['verify', '--print-certs', apk], {encoding: 'utf8', shell: process.platform === 'win32'});
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}${run.error?.message ?? ''}`;
  const digest = signerDigest(output);
  if (digest !== PHONE_SIGNER) {
    console.error(`✖ ${apk} is signed by ${digest ?? 'no key'}, not the phone's key ${PHONE_SIGNER.slice(0, 8)}…; it would not install over the app.\napksigner said:\n${output.slice(0, 2000)}`);
    process.exit(1);
  }
  console.log(`✔ ${apk} is signed with the phone's key (${PHONE_SIGNER.slice(0, 8)}…).`);
}
