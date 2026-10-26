#!/usr/bin/env node
import './node24.mjs';
import {rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {logs, serveSite, start, startConvex, stopAll} from './local-stack.mjs';

const phoneState = resolve(logs, 'phone.json');
const PORT = +(process.env.PORT ?? 5179);

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

try {
  const syncUrl = await startConvex();
  rmSync(phoneState, {force: true});
  const phone = start('phone', process.execPath, ['scripts/web-sync/phone-standin.mjs', '--watch', '--site', syncUrl, '--state', phoneState]);
  await phone.waitFor(/Paired with/, 60000);
  await phone.waitFor(/Synced/, 30000);
  const site = await serveSite({syncUrl, port: PORT});
  console.log(`Ready: ${site} reads the stand-in phone. Logs in .verify/web-sync/. Ctrl+C stops everything.`);
} catch (error) {
  console.error(error.message);
  stopAll();
  process.exit(1);
}
