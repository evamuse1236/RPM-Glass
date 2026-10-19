import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export function avdConfig(text) {
  const settings = {'hw.lcd.width': '1080', 'hw.lcd.height': '2340', 'hw.lcd.density': '450', 'skin.name': '1080x2340', 'skin.path': '_no_skin', showDeviceFrame: 'no'};
  const lines = text.split(/\r?\n/).filter(line => !Object.hasOwn(settings, line.split('=')[0].trim()));
  return [...lines.filter(Boolean), ...Object.entries(settings).map(([key, value]) => `${key}=${value}`)].join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = spawnSync('adb', ['start-server'], {encoding: 'utf8'});
  if (server.error || server.status !== 0) throw new Error(server.error?.message || server.stderr || 'Could not start CI adb server.');
  const dir = process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android/avd');
  const config = path.join(dir, 'Galaxy_S24_FE_API_36.avd/config.ini');
  if (!fs.existsSync(config)) {
    const created = spawnSync('avdmanager', ['create', 'avd', '--force', '-n', 'Galaxy_S24_FE_API_36', '--abi', 'google_apis_playstore/x86_64', '--package', 'system-images;android-36;google_apis_playstore;x86_64', '--device', 'pixel_2'], {input: 'no\n', encoding: 'utf8'});
    if (created.error || created.status !== 0) throw new Error(created.error?.message || created.stderr || 'Could not create CI AVD.');
  }
  const before = fs.readFileSync(config, 'utf8'), after = avdConfig(before);
  if (before !== after) fs.writeFileSync(config, after);
}
